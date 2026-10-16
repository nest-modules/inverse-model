import {
  DataSource,
  type DataSourceOptions,
  type EntityMetadata,
} from 'typeorm';
import type {
  DatabaseAdapter,
  DatabaseConnection,
  FieldDefinition,
  FieldType,
  ModelDefinition,
} from '../database-adapter.interface';
import { createEntitySchema } from './create-entity-schema';

type ColumnMetadata = EntityMetadata['columns'][number];

export interface SqlAdapterOptions {
  name: string;
  protocols: readonly string[];
  type: DataSourceOptions['type'];
  /** getTables() with no names also returns the catalogs of the server. */
  systemSchemas: readonly string[];
  /**
   * GraphQL type of a column type as TypeORM reports it. Anything not listed
   * (text, uuid, enums, and bigint and numeric, which drivers return as strings
   * to keep their precision) is a String.
   */
  fieldTypes: Readonly<Record<string, FieldType>>;
}

function fieldOf(
  column: ColumnMetadata,
  fieldTypes: SqlAdapterOptions['fieldTypes'],
): FieldDefinition {
  return {
    name: column.databaseName,
    property: column.propertyName,
    type: fieldTypes[String(column.type)] ?? 'String',
    isArray: column.isArray,
    isNullable: column.isNullable,
    hasDefault: column.isGenerated || column.default !== undefined,
  };
}

const modelOf = (
  entity: EntityMetadata,
  fieldTypes: SqlAdapterOptions['fieldTypes'],
): ModelDefinition => ({
  name: entity.name,
  fields: entity.columns.map((column) => fieldOf(column, fieldTypes)),
});

/**
 * Adapter for a SQL database supported by TypeORM: reads its tables and
 * builds one entity per table. The schema is never synchronized.
 */
export function createSqlAdapter(options: SqlAdapterOptions): DatabaseAdapter {
  return {
    name: options.name,
    protocols: options.protocols,
    async connect(url): Promise<DatabaseConnection> {
      const dataSourceOptions = {
        type: options.type,
        url,
      } as DataSourceOptions;

      const inspector = await new DataSource(dataSourceOptions).initialize();
      const queryRunner = inspector.createQueryRunner();
      const allTables = await queryRunner.getTables().finally(async () => {
        await queryRunner.release();
        await inspector.destroy();
      });

      const tables = allTables.filter(
        (table) =>
          !options.systemSchemas.includes(table.schema ?? table.database ?? ''),
      );

      const dataSource = await new DataSource({
        ...dataSourceOptions,
        entities: tables.map(createEntitySchema),
        synchronize: false,
      }).initialize();

      return {
        models: dataSource.entityMetadatas.map((entity) =>
          modelOf(entity, options.fieldTypes),
        ),
        async insert(model, input) {
          const result = await dataSource
            .getRepository(model.name)
            .insert(input);
          return { ...input, ...result.generatedMaps[0] };
        },
        close: () => dataSource.destroy(),
      };
    },
  };
}
