import {
  DataSource,
  type DataSourceOptions,
  type EntityMetadata,
  type FindOptionsWhere,
  type Table,
} from 'typeorm';
import { camelCase } from '../../utils/naming';
import type {
  ConnectOptions,
  DatabaseAdapter,
  DatabaseConnection,
  DatabaseRecord,
  FieldDefinition,
  FieldType,
  ModelDefinition,
} from '../database-adapter.interface';
import { addRelations, type ForeignKey } from '../relations';
import { createEntitySchema, entityNameOf } from './create-entity-schema';
import { whereSql } from './where-sql';

type ColumnMetadata = EntityMetadata['columns'][number];

export interface SqlAdapterOptions {
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
): ModelDefinition {
  // A table without a key had every column made primary for TypeORM's sake.
  const hasPrimaryKey = table.columns.some((column) => column.isPrimary);
  return {
    name: entity.name,
    source: table.name,
    fields: entity.columns.map((column) =>
      fieldOf(column, table, fieldTypes, overrides),
    ),
    primaryKey: hasPrimaryKey
      ? entity.primaryColumns.map((column) => column.propertyName)
      : [],
    relations: [],
  };
}

/** Single-column foreign keys between the exposed tables; composite ones are left out. */
function foreignKeysOf(
  tables: Table[],
  models: Map<Table, ModelDefinition>,
): ForeignKey[] {
  const tableNamed = (name: string) =>
    tables.find((table) => table.name === name) ??
    tables.find((table) => entityNameOf(table.name) === entityNameOf(name));

  return tables.flatMap((table) =>
    table.foreignKeys.flatMap((key) => {
      const target = tableNamed(key.referencedTableName);
      if (!target || key.columnNames.length !== 1) return [];
      return [
        {
          source: models.get(table) as ModelDefinition,
          field: camelCase(key.columnNames[0]),
          target: models.get(target) as ModelDefinition,
          reference: camelCase(key.referencedColumnNames[0]),
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
) {
  const inspector = await new DataSource(options).initialize();
  const queryRunner = inspector.createQueryRunner();
  try {
    const rows: { name: string }[] = await queryRunner.query(
      adapter.tablesQuery,
    );
    const names = rows.map((row) => row.name);
    const tables = names.length > 0 ? await queryRunner.getTables(names) : [];
    const overrideRows: OverrideRow[] = adapter.fieldTypeOverridesQuery
      ? await queryRunner.query(adapter.fieldTypeOverridesQuery)
      : [];
    const overrides: FieldTypeOverrides = new Map(
      overrideRows.map((row) => [
        `${row.table_name}.${row.column_name}`,
        row.field_type,
      ]),
    );
    return { tables, overrides };
  } finally {
    await queryRunner.release();
    await inspector.destroy();
  }
}

function connectionOver(
  dataSource: DataSource,
  models: ModelDefinition[],
): DatabaseConnection {
  const repository = (model: ModelDefinition) =>
    dataSource.getRepository<DatabaseRecord>(model.name);
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

  return {
    models,
    async find(model, { where, orderBy, limit, offset }) {
      const { sql, parameters } = whereSql(where, 't');
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
      const { sql, parameters } = whereSql(where, 't');
      const row = await repository(model)
        .createQueryBuilder('t')
        .select('COUNT(*)', 'count')
        .where(sql, parameters)
        .getRawOne<{ count: string | number }>();
      return Number(row?.count ?? 0);
    },
    findOne,
    async insert(model, input) {
      const result = await repository(model).insert(input);
      const created = { ...input, ...result.generatedMaps[0] };
      // Re-read so defaults the driver does not return (MySQL has no RETURNING) show up.
      const key = Object.fromEntries(
        model.primaryKey.map((property) => [property, created[property]]),
      );
      const complete =
        model.primaryKey.length > 0 &&
        Object.values(key).every((value) => value !== undefined);
      return (
        (complete && (await findOne(model, key))) || normalize(model, created)
      );
    },
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
    close: () => dataSource.destroy(),
  };
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

      const { tables, overrides } = await readTables(
        dataSourceOptions,
        options,
      );
      const dataSource = await new DataSource({
        ...dataSourceOptions,
        entities: tables.map(createEntitySchema),
        synchronize: false,
      }).initialize();

      const modelsByTable = new Map(
        tables.map((table) => [
          table,
          modelOf(
            dataSource.getMetadata(entityNameOf(table.name)),
            table,
            options.fieldTypes,
            overrides,
          ),
        ]),
      );
      addRelations(foreignKeysOf(tables, modelsByTable));

      return connectionOver(dataSource, [...modelsByTable.values()]);
    },
  };
}
