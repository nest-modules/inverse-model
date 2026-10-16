import { createSqlAdapter } from '../sql/create-sql-adapter';

/** PostgreSQL through TypeORM; needs the `pg` package. */
export const postgresAdapter = createSqlAdapter({
  name: 'postgres',
  protocols: ['postgres', 'postgresql'],
  type: 'postgres',
  tablesQuery: `
    SELECT table_schema || '.' || table_name AS name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')`,
  viewsQuery: `
    SELECT table_schema || '.' || table_name AS name
    FROM information_schema.views
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`,
  // PostgreSQL sorts nulls as larger than any value.
  nullsFirst: false,
  fieldTypes: {
    smallint: 'Int',
    integer: 'Int',
    int: 'Int',
    int2: 'Int',
    int4: 'Int',
    real: 'Float',
    float4: 'Float',
    float8: 'Float',
    'double precision': 'Float',
    boolean: 'Boolean',
    bool: 'Boolean',
    date: 'DateTime',
    timestamp: 'DateTime',
    timestamptz: 'DateTime',
    'timestamp without time zone': 'DateTime',
    'timestamp with time zone': 'DateTime',
    json: 'JSON',
    jsonb: 'JSON',
  },
});
