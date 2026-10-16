import { createSqlAdapter } from '../sql/create-sql-adapter';

/** PostgreSQL through TypeORM; needs the `pg` package. */
export const postgresAdapter = createSqlAdapter({
  name: 'postgres',
  protocols: ['postgres', 'postgresql'],
  type: 'postgres',
  systemSchemas: ['pg_catalog', 'information_schema'],
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
