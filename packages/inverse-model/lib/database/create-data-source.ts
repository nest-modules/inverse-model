import { DataSource, type DataSourceOptions } from 'typeorm';
import { createEntitySchema } from './create-entity-schema';

const DRIVERS: Record<string, DataSourceOptions['type']> = {
  postgres: 'postgres',
  postgresql: 'postgres',
  mysql: 'mysql',
  mariadb: 'mariadb',
};

// getTables() with no names also returns the catalogs of the server.
const SYSTEM_SCHEMAS = [
  'pg_catalog',
  'information_schema',
  'mysql',
  'performance_schema',
  'sys',
];

function driverOf(url: string) {
  const protocol = new URL(url).protocol.replace(/:$/, '');
  const type = DRIVERS[protocol];
  if (!type) {
    throw new Error(`Unsupported database protocol: ${protocol}`);
  }
  return type;
}

/**
 * Reads the tables of the database behind `url` and returns a data source
 * with one entity per table. The schema is never synchronized.
 */
export async function createDataSource(url: string): Promise<DataSource> {
  const options = { type: driverOf(url), url } as DataSourceOptions;

  const inspector = await new DataSource(options).initialize();
  const queryRunner = inspector.createQueryRunner();
  const allTables = await queryRunner.getTables().finally(async () => {
    await queryRunner.release();
    await inspector.destroy();
  });

  const tables = allTables.filter(
    (table) => !SYSTEM_SCHEMAS.includes(table.schema ?? table.database ?? ''),
  );

  return new DataSource({
    ...options,
    entities: tables.map(createEntitySchema),
    synchronize: false,
  }).initialize();
}
