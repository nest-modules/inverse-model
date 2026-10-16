import { type DriverPackage, driverFor, protocolOf } from '../drivers';
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

const isMissing = (error: any, driver: DriverPackage) =>
  error?.name === 'DriverPackageNotInstalledError' ||
  (error?.code === 'MODULE_NOT_FOUND' &&
    String(error.message).includes(`'${driver.name}'`));

/** Turns a missing driver package into an error that names the package to install. */
function withDriverHint(adapter: DatabaseAdapter, driver: DriverPackage) {
  return {
    ...adapter,
    connect: (...args) =>
      adapter.connect(...args).catch((error) => {
        if (!isMissing(error, driver)) throw error;
        throw new Error(
          `The ${adapter.name} adapter needs the ${driver.name} package: npm install ${driver.name}@^${driver.version}`,
          { cause: error },
        );
      }),
  } satisfies DatabaseAdapter;
}

/** The adapter for the protocol of `url`. */
export function findAdapter(url: string): DatabaseAdapter {
  const protocol = protocolOf(url);
  const adapter = ADAPTERS.find((candidate) =>
    candidate.protocols.includes(protocol),
  );
  if (!adapter) {
    const supported = ADAPTERS.flatMap((candidate) => candidate.protocols);
    throw new Error(
      `Unsupported database protocol: ${protocol} (supported: ${supported.join(', ')})`,
    );
  }
  const driver = driverFor(protocol);
  return driver ? withDriverHint(adapter, driver) : adapter;
}
