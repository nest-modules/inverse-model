import type { FieldType } from '../database-adapter.interface';
import { createSqlAdapter } from '../sql/create-sql-adapter';

// The database of the URL; MySQL has no schemas inside a database.
const TABLES_QUERY = `
  SELECT table_name AS name
  FROM information_schema.tables
  WHERE table_type = 'BASE TABLE' AND table_schema = DATABASE()`;

const FIELD_TYPES: Record<string, FieldType> = {
  tinyint: 'Int',
  smallint: 'Int',
  mediumint: 'Int',
  int: 'Int',
  integer: 'Int',
  float: 'Float',
  double: 'Float',
  'double precision': 'Float',
  real: 'Float',
  boolean: 'Boolean',
  bool: 'Boolean',
  date: 'DateTime',
  datetime: 'DateTime',
  timestamp: 'DateTime',
  json: 'JSON',
};

/** MySQL through TypeORM; needs the `mysql2` package. */
export const mysqlAdapter = createSqlAdapter({
  name: 'mysql',
  protocols: ['mysql'],
  type: 'mysql',
  tablesQuery: TABLES_QUERY,
  fieldTypes: FIELD_TYPES,
});

/** MariaDB through TypeORM; needs the `mysql2` package. */
export const mariadbAdapter = createSqlAdapter({
  name: 'mariadb',
  protocols: ['mariadb'],
  type: 'mariadb',
  tablesQuery: TABLES_QUERY,
  fieldTypes: FIELD_TYPES,
});
