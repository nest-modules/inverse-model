import { introspectPostgres } from './drivers/postgres';
import type { DatabaseSchema } from './schema';

const drivers: Record<string, (url: string) => Promise<DatabaseSchema>> = {
  postgres: introspectPostgres,
  postgresql: introspectPostgres,
};

/** Reads the schema of the database behind a connection string. */
export function introspect(connectionString: string): Promise<DatabaseSchema> {
  const protocol = new URL(connectionString).protocol.replace(/:$/, '');
  const driver = drivers[protocol];
  if (!driver) {
    throw new Error(`Unsupported database protocol: ${protocol}`);
  }
  return driver(connectionString);
}
