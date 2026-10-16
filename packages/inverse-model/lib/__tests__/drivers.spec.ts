import { findAdapter } from '../adapters/find-adapter';
import { mongodbAdapter } from '../adapters/mongodb/mongodb.adapter';
import { mariadbAdapter, mysqlAdapter } from '../adapters/mysql/mysql.adapter';
import { postgresAdapter } from '../adapters/postgres/postgres.adapter';
import { sqlServerAdapter } from '../adapters/sqlserver/sqlserver.adapter';
import {
  DRIVERS,
  driverFor,
  protocolOf,
  SUPPORTED_PROTOCOLS,
} from '../drivers';

const {
  peerDependencies,
  peerDependenciesMeta,
} = require('../../package.json');

describe('drivers', () => {
  it('lists exactly the protocols the adapters handle', () => {
    const protocols = [
      postgresAdapter,
      mysqlAdapter,
      mariadbAdapter,
      sqlServerAdapter,
      mongodbAdapter,
    ].flatMap((adapter) => adapter.protocols);

    expect([...SUPPORTED_PROTOCOLS].sort()).toEqual([...protocols].sort());
  });

  it.each(
    Object.values(DRIVERS).map((driver) => [driver.name, driver.version]),
  )('declares %s as an optional peer dependency', (name, version) => {
    expect(peerDependencies[name]).toBeDefined();
    expect(peerDependenciesMeta[name]).toEqual({ optional: true });
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('reads the protocol of a URL', () => {
    expect(protocolOf('MongoDB+SRV://cluster.example.com/blog')).toBe(
      'mongodb+srv',
    );
  });

  it('finds no driver for unknown protocols', () => {
    expect(driverFor('oracle')).toBeUndefined();
    expect(driverFor('constructor')).toBeUndefined();
    expect(driverFor('postgresql')).toEqual({ name: 'pg', version: '8.23.1' });
  });
});

describe('findAdapter with a missing driver', () => {
  const missing = (error: Error) => {
    jest.spyOn(postgresAdapter, 'connect').mockRejectedValue(error);
    return findAdapter('postgres://localhost/blog').connect(
      'postgres://localhost/blog',
    );
  };

  afterEach(() => jest.restoreAllMocks());

  it('names the package TypeORM could not load', async () => {
    const error = Object.assign(new Error('pg package has not been found'), {
      name: 'DriverPackageNotInstalledError',
    });

    await expect(missing(error)).rejects.toThrow(
      'The postgres adapter needs the pg package: npm install pg@^8.23.1',
    );
  });

  it('names the package Node could not resolve', async () => {
    const error = Object.assign(new Error("Cannot find module 'pg'"), {
      code: 'MODULE_NOT_FOUND',
    });

    await expect(missing(error)).rejects.toThrow('npm install pg@^8.23.1');
  });

  it('passes other errors through', async () => {
    const error = new Error('connection refused');

    await expect(missing(error)).rejects.toBe(error);
  });
});
