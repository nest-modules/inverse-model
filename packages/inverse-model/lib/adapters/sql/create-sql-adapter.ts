import {
  DataSource,
  type DataSourceOptions,
  type EntityManager,
  type EntityMetadata,
  type FindOptionsWhere,
  type Table,
} from 'typeorm';
import { defaultNaming, type Naming } from '../../utils/naming';
import type {
  ConnectOptions,
  DatabaseAdapter,
  DatabaseConnection,
  DatabaseRecord,
  DatabaseTransaction,
  FieldDefinition,
  FieldType,
  ModelDefinition,
} from '../database-adapter.interface';
import { addRelations, type ForeignKey } from '../relations';
import { createEntitySchema } from './create-entity-schema';
import { readViews, type ViewQueries } from './read-views';
import { type RelationScope, whereSql } from './where-sql';

type ColumnMetadata = EntityMetadata['columns'][number];

export interface SqlAdapterOptions extends ViewQueries {
  name: string;
  protocols: readonly string[];
  type: DataSourceOptions['type'];
  /**
   * Lists the tables to expose as one `name` column, schema-qualified where
   * needed. getTables() with no names would crawl every schema of the server.
   */
  tablesQuery: string;
  /**
   * GraphQL type of a column type as TypeORM reports it. Anything not listed
   * (text, uuid, enums, and bigint and numeric, which drivers return as
   * strings to keep their precision) is a String.
   */
  fieldTypes: Readonly<Record<string, FieldType>>;
  /**
   * Columns whose type the column type alone does not tell, as rows of
   * `table_name`, `column_name` and `field_type` (e.g. MySQL's tinyint(1)
   * booleans).
   */
  fieldTypeOverridesQuery?: string;
  /** Data source options for the URL and connect options; by default `ssl` goes through as is. */
  connectionOptions?: (url: URL, options: ConnectOptions) => object;
  /** Whether nulls sort first in ascending order; true unless given. */
  nullsFirst?: boolean;
}

const defaultConnectionOptions = (_url: URL, { ssl }: ConnectOptions) =>
  ssl === undefined ? {} : { ssl };

/** Field type per `table.column`, from `fieldTypeOverridesQuery`. */
type FieldTypeOverrides = ReadonlyMap<string, FieldType>;

function fieldOf(
  column: ColumnMetadata,
  table: Table,
  fieldTypes: SqlAdapterOptions['fieldTypes'],
  overrides: FieldTypeOverrides,
): FieldDefinition {
  return {
    name: column.databaseName,
    property: column.propertyName,
    type:
      overrides.get(`${table.name}.${column.databaseName}`) ??
      fieldTypes[String(column.type)] ??
      'String',
    isArray: column.isArray,
    isNullable: column.isNullable,
    hasDefault: column.isGenerated || column.default !== undefined,
  };
}

function modelOf(
  entity: EntityMetadata,
  table: Table,
  fieldTypes: SqlAdapterOptions['fieldTypes'],
  overrides: FieldTypeOverrides,
  naming: Naming,
  readOnly: boolean,
): ModelDefinition {
  // A table without a key had every column made primary for TypeORM's sake.
  const hasPrimaryKey = table.columns.some((column) => column.isPrimary);
  const name = naming.type(table.name);
  return {
    name,
    plural: naming.plural(name),
    source: table.name,
    fields: entity.columns.map((column) =>
      fieldOf(column, table, fieldTypes, overrides),
    ),
    primaryKey: hasPrimaryKey
      ? entity.primaryColumns.map((column) => column.propertyName)
      : [],
    relations: [],
    ...(readOnly ? { readOnly } : {}),
  };
}

/** Foreign keys between the exposed tables and views, single-column and composite. */
function foreignKeysOf(
  tables: Table[],
  models: Map<Table, ModelDefinition>,
  naming: Naming,
): ForeignKey[] {
  // A referenced table may be reported with or without its schema.
  const unqualified = (name: string) => name.split('.').pop();
  const tableNamed = (name: string) =>
    tables.find((table) => table.name === name) ??
    tables.find((table) => unqualified(table.name) === unqualified(name));

  return tables.flatMap((table) =>
    table.foreignKeys.flatMap((key) => {
      const target = tableNamed(key.referencedTableName);
      if (!target) return [];
      return [
        {
          source: models.get(table) as ModelDefinition,
          fields: key.columnNames.map((column) =>
            naming.field(column, table.name),
          ),
          target: models.get(target) as ModelDefinition,
          references: key.referencedColumnNames.map((column) =>
            naming.field(column, target.name),
          ),
        },
      ];
    }),
  );
}

interface OverrideRow {
  table_name: string;
  column_name: string;
  field_type: FieldType;
}

async function readTables(
  options: DataSourceOptions,
  adapter: SqlAdapterOptions,
  connectOptions: ConnectOptions,
) {
  const inspector = await new DataSource(options).initialize();
  const queryRunner = inspector.createQueryRunner();
  try {
    const rows: { name: string }[] = await queryRunner.query(
      adapter.tablesQuery,
    );
    const names = rows.map((row) => row.name);
    const tables = names.length > 0 ? await queryRunner.getTables(names) : [];
    const views = await readViews(queryRunner, adapter, connectOptions.views);
    const overrideRows: OverrideRow[] = adapter.fieldTypeOverridesQuery
      ? await queryRunner.query(adapter.fieldTypeOverridesQuery)
      : [];
    const overrides: FieldTypeOverrides = new Map(
      overrideRows.map((row) => [
        `${row.table_name}.${row.column_name}`,
        row.field_type,
      ]),
    );
    return { tables, views, overrides };
  } finally {
    await queryRunner.release();
    await inspector.destroy();
  }
}

/** A unique entity name per table, since tables of two schemas may share a name. */
function entityNamesOf(tables: Table[]): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  for (const table of tables) {
    const base = table.name.replace(/\W/g, '_');
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
    taken.add(name);
    names.set(table.name, name);
  }
  return names;
}

/** Rows deleted per statement, well under SQL Server's 2100 parameters. */
const DELETE_CHUNK = 500;

/** Operations through `manager`: the data source's own, or one bound to a transaction. */
function connectionOver(
  dataSource: DataSource,
  models: ModelDefinition[],
  entityNames: Map<string, string>,
  nullsFirst: boolean,
  manager: EntityManager = dataSource.manager,
): DatabaseConnection {
  const entityOf = (model: ModelDefinition) =>
    entityNames.get(model.source) as string;
  const repository = (model: ModelDefinition) =>
    manager.getRepository<DatabaseRecord>(entityOf(model));
  const { driver } = dataSource;
  const scope = (model: ModelDefinition): RelationScope => ({
    model,
    models,
    table: (other) =>
      dataSource
        .getMetadata(entityOf(other))
        .tablePath.split('.')
        .map((part) => driver.escape(part))
        .join('.'),
    escape: (name) => driver.escape(name),
  });
  /** The primary key in `input`, or null when part of it is missing. */
  const keyIn = (model: ModelDefinition, input: DatabaseRecord) => {
    const key = Object.fromEntries(
      model.primaryKey.map((property) => [property, input[property]]),
    );
    const complete =
      model.primaryKey.length > 0 &&
      Object.values(key).every(
        (value) => value !== undefined && value !== null,
      );
    return complete ? key : null;
  };
  // Keys come from the API already matched against the primary key columns.
  const byKey = (key: DatabaseRecord) =>
    key as FindOptionsWhere<DatabaseRecord>;
  /** MySQL hands booleans back as 1 and 0. */
  const normalize = (model: ModelDefinition, record: DatabaseRecord) => {
    for (const field of model.fields) {
      const value = record[field.property];
      if (field.type === 'Boolean' && typeof value === 'number') {
        record[field.property] = value !== 0;
      }
    }
    return record;
  };
  const findOne = async (model: ModelDefinition, key: DatabaseRecord) => {
    const record = await repository(model).findOneBy(byKey(key));
    return record && normalize(model, record);
  };
  const insert = async (model: ModelDefinition, input: DatabaseRecord) => {
    const result = await repository(model).insert(input);
    const created = { ...input, ...result.generatedMaps[0] };
    // Re-read so defaults the driver does not return (MySQL has no RETURNING) show up.
    const key = keyIn(model, created);
    return (key && (await findOne(model, key))) || normalize(model, created);
  };

  function transaction<T>(
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    if (manager.queryRunner?.isTransactionActive) {
      return work({ connection, active: true, manager });
    }
    return dataSource.transaction((transactional) =>
      work({
        connection: connectionOver(
          dataSource,
          models,
          entityNames,
          nullsFirst,
          transactional,
        ),
        active: true,
        manager: transactional,
      }),
    );
  }

  const connection: DatabaseConnection = {
    models,
    nullsFirst,
    async find(model, { where, orderBy, limit, offset }) {
      const { sql, parameters } = whereSql(where, 't', scope(model));
      const query = repository(model)
        .createQueryBuilder('t')
        .where(sql, parameters);
      for (const entry of orderBy ?? []) {
        for (const [property, direction] of Object.entries(entry)) {
          query.addOrderBy(`t.${property}`, direction);
        }
      }
      if (limit !== undefined && limit !== null) query.take(limit);
      if (offset) query.skip(offset);
      const records = await query.getMany();
      return records.map((record) => normalize(model, record));
    },
    async count(model, where) {
      const { sql, parameters } = whereSql(where, 't', scope(model));
      const row = await repository(model)
        .createQueryBuilder('t')
        .select('COUNT(*)', 'count')
        .where(sql, parameters)
        .getRawOne<{ count: string | number }>();
      return Number(row?.count ?? 0);
    },
    findOne,
    insert,
    async update(model, key, input) {
      if (Object.keys(input).length > 0) {
        await repository(model).update(byKey(key), input);
      }
      return findOne(model, key);
    },
    async delete(model, key) {
      const record = await findOne(model, key);
      if (record) await repository(model).delete(byKey(key));
      return record;
    },
    async upsert(model, input) {
      const key = keyIn(model, input);
      if (!key) return insert(model, input);
      return transaction(async ({ connection: inner }) => {
        if (!(await inner.findOne(model, key))) {
          return inner.insert(model, input);
        }
        const changes = Object.fromEntries(
          Object.entries(input).filter(
            ([property]) => !model.primaryKey.includes(property),
          ),
        );
        return (await inner.update(model, key, changes)) as DatabaseRecord;
      });
    },
    async insertMany(model, inputs) {
      if (inputs.length > 0) await repository(model).insert(inputs);
      return inputs.length;
    },
    async deleteMany(model, where) {
      if (model.primaryKey.length === 0) {
        throw new Error(`${model.name} has no primary key to delete by`);
      }
      const { sql, parameters } = whereSql(where, 't', scope(model));
      // Keys first, so the filter, relation subqueries included, runs as a SELECT.
      return transaction(async ({ manager: inner }) => {
        const entity = entityOf(model);
        const keys = await (inner as EntityManager)
          .getRepository<DatabaseRecord>(entity)
          .createQueryBuilder('t')
          .select(model.primaryKey.map((property) => `t.${property}`))
          .where(sql, parameters)
          .getMany();
        for (let i = 0; i < keys.length; i += DELETE_CHUNK) {
          await (inner as EntityManager)
            .createQueryBuilder()
            .delete()
            .from(entity)
            .whereInIds(keys.slice(i, i + DELETE_CHUNK))
            .execute();
        }
        return keys.length;
      });
    },
    transaction,
    // Only the connection the adapter opened owns the data source.
    close: async () => {
      if (manager === dataSource.manager) await dataSource.destroy();
    },
  };
  return connection;
}

/**
 * Adapter for a SQL database supported by TypeORM: reads its tables and
 * foreign keys and builds one entity per table. The schema is never synchronized.
 */
export function createSqlAdapter(options: SqlAdapterOptions): DatabaseAdapter {
  const connectionOptions =
    options.connectionOptions ?? defaultConnectionOptions;
  return {
    name: options.name,
    protocols: options.protocols,
    async connect(url, connectOptions = {}) {
      const dataSourceOptions = {
        type: options.type,
        url,
        ...connectionOptions(new URL(url), connectOptions),
      } as DataSourceOptions;

      const { tables, views, overrides } = await readTables(
        dataSourceOptions,
        options,
        connectOptions,
      );
      const naming = connectOptions.naming ?? defaultNaming;
      const all = [...tables, ...views];
      const entityNames = entityNamesOf(all);
      const entityNameOf = (table: Table) =>
        entityNames.get(table.name) as string;
      const dataSource = await new DataSource({
        ...dataSourceOptions,
        entities: all.map((table) =>
          createEntitySchema(table, entityNameOf(table), naming),
        ),
        synchronize: false,
      }).initialize();

      const modelsByTable = new Map(
        all.map((table) => [
          table,
          modelOf(
            dataSource.getMetadata(entityNameOf(table)),
            table,
            options.fieldTypes,
            overrides,
            naming,
            views.includes(table),
          ),
        ]),
      );
      addRelations(foreignKeysOf(all, modelsByTable, naming));

      return connectionOver(
        dataSource,
        [...modelsByTable.values()],
        entityNames,
        options.nullsFirst ?? true,
      );
    },
  };
}
