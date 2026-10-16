import type { DatabaseAdapter } from './database-adapter.interface';
import { mongodbAdapter } from './mongodb/mongodb.adapter';
import { mariadbAdapter, mysqlAdapter } from './mysql/mysql.adapter';
import { postgresAdapter } from './postgres/postgres.adapter';
import { sqlServerAdapter } from './sqlserver/sqlserver.adapter';

const ADAPTERS: readonly DatabaseAdapter[] = [
  postgresAdapter,
  mysqlAdapter,
  mariadbAdapter,
  sqlServerAdapter,
  mongodbAdapter,
];

/** The adapter for the protocol of `url`. */
export function findAdapter(url: string): DatabaseAdapter {
  const protocol = new URL(url).protocol.replace(/:$/, '').toLowerCase();
  const adapter = ADAPTERS.find((candidate) =>
    candidate.protocols.includes(protocol),
  );
  if (!adapter) {
    const supported = ADAPTERS.flatMap((candidate) => candidate.protocols);
    throw new Error(
      `Unsupported database protocol: ${protocol} (supported: ${supported.join(', ')})`,
    );
  }
  return adapter;
}
