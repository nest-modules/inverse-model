import type { FieldType } from '../database-adapter.interface';
import { createSqlAdapter } from '../sql/create-sql-adapter';

// The database of the URL; MySQL has no schemas inside a database.
const TABLES_QUERY = `
  SELECT table_name AS name
  FROM information_schema.tables
  WHERE table_type = 'BASE TABLE' AND table_schema = DATABASE()`;

// MySQL stores boolean columns as tinyint(1), which TypeORM reports as plain tinyint.
const BOOLEAN_COLUMNS_QUERY = `
  SELECT table_name AS table_name, column_name AS column_name, 'Boolean' AS field_type
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND column_type = 'tinyint(1)'`;

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
  fieldTypeOverridesQuery: BOOLEAN_COLUMNS_QUERY,
  fieldTypes: FIELD_TYPES,
});

/** MariaDB through TypeORM; needs the `mysql2` package. */
export const mariadbAdapter = createSqlAdapter({
  name: 'mariadb',
  protocols: ['mariadb'],
  type: 'mariadb',
  tablesQuery: TABLES_QUERY,
  fieldTypeOverridesQuery: BOOLEAN_COLUMNS_QUERY,
  fieldTypes: FIELD_TYPES,
});
