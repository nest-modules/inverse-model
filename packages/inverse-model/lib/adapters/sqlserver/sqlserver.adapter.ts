import type { SslOptions } from '../database-adapter.interface';
import { createSqlAdapter } from '../sql/create-sql-adapter';

const flag = (url: URL, name: string) => {
  const value = url.searchParams.get(name);
  return value === null ? undefined : value === 'true';
};

/**
 * SQL Server through TypeORM; needs the `mssql` package. Encryption follows
 * `ssl`, or the `encrypt` and `trustServerCertificate` URL parameters.
 */
export const sqlServerAdapter = createSqlAdapter({
  name: 'sqlserver',
  protocols: ['mssql', 'sqlserver'],
  type: 'mssql',
  tablesQuery: `
    SELECT TABLE_SCHEMA + '.' + TABLE_NAME AS name
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'`,
  fieldTypes: {
    tinyint: 'Int',
    smallint: 'Int',
    int: 'Int',
    real: 'Float',
    float: 'Float',
    bit: 'Boolean',
    date: 'DateTime',
    datetime: 'DateTime',
    datetime2: 'DateTime',
    smalldatetime: 'DateTime',
    datetimeoffset: 'DateTime',
  },
  connectionOptions(url, { ssl }) {
    const tls: SslOptions = typeof ssl === 'object' ? ssl : {};
    return {
      options: {
        encrypt: flag(url, 'encrypt') ?? ssl !== false,
        trustServerCertificate:
          flag(url, 'trustServerCertificate') ??
          tls.rejectUnauthorized === false,
      },
    };
  },
});
