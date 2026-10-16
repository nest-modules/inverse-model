import type { FieldType } from '../database-adapter.interface';
import { createSqlAdapter } from '../sql/create-sql-adapter';

const SYSTEM_SCHEMAS = [
  'information_schema',
  'mysql',
  'performance_schema',
  'sys',
];

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
  systemSchemas: SYSTEM_SCHEMAS,
  fieldTypes: FIELD_TYPES,
});

/** MariaDB through TypeORM; needs the `mysql2` package. */
export const mariadbAdapter = createSqlAdapter({
  name: 'mariadb',
  protocols: ['mariadb'],
  type: 'mariadb',
  systemSchemas: SYSTEM_SCHEMAS,
  fieldTypes: FIELD_TYPES,
});
