// Imports nothing, so the generator can read it without loading Nest or TypeORM.

/** npm package of a database driver, with the version generated projects install. */
export interface DriverPackage {
  name: string;
  version: string;
}

const PG: DriverPackage = { name: 'pg', version: '8.23.1' };
const MYSQL2: DriverPackage = { name: 'mysql2', version: '3.24.6' };
const MSSQL: DriverPackage = { name: 'mssql', version: '12.7.2' };
const MONGODB: DriverPackage = { name: 'mongodb', version: '7.7.0' };

/** Driver package each URL protocol needs, keyed by protocol without the colon. */
export const DRIVERS: Readonly<Record<string, DriverPackage>> = {
  postgres: PG,
  postgresql: PG,
  mysql: MYSQL2,
  mariadb: MYSQL2,
  mssql: MSSQL,
  sqlserver: MSSQL,
  mongodb: MONGODB,
  'mongodb+srv': MONGODB,
};

/** Protocols the library can connect to. */
export const SUPPORTED_PROTOCOLS = Object.keys(DRIVERS);

/** Protocol of a connection string, lowercased and without the colon. */
export const protocolOf = (url: string) =>
  new URL(url).protocol.replace(/:$/, '').toLowerCase();

/** The driver package for `protocol`, or undefined when it is not supported. */
export const driverFor = (protocol: string): DriverPackage | undefined =>
  Object.hasOwn(DRIVERS, protocol) ? DRIVERS[protocol] : undefined;
