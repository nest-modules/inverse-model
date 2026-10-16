import type { DatabaseAdapter } from './database-adapter.interface';
import { mongodbAdapter } from './mongodb/mongodb.adapter';
import { mariadbAdapter, mysqlAdapter } from './mysql/mysql.adapter';
import { postgresAdapter } from './postgres/postgres.adapter';

export const DEFAULT_ADAPTERS: readonly DatabaseAdapter[] = [
  postgresAdapter,
  mysqlAdapter,
  mariadbAdapter,
  mongodbAdapter,
];

const protocolOf = (url: string) =>
  new URL(url).protocol.replace(/:$/, '').toLowerCase();

/** The adapter for the protocol of `url`; `custom` ones take precedence over the built-in ones. */
export function findAdapter(
  url: string,
  custom: readonly DatabaseAdapter[] = [],
): DatabaseAdapter {
  const protocol = protocolOf(url);
  const adapters = [...custom, ...DEFAULT_ADAPTERS];
  const adapter = adapters.find((candidate) =>
    candidate.protocols.includes(protocol),
  );
  if (!adapter) {
    const supported = adapters.flatMap((candidate) => candidate.protocols);
    throw new Error(
      `Unsupported database protocol: ${protocol} (supported: ${supported.join(', ')})`,
    );
  }
  return adapter;
}
