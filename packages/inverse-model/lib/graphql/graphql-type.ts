const GRAPHQL_TYPES: Record<string, string> = {
  smallint: 'Int',
  integer: 'Int',
  int: 'Int',
  int2: 'Int',
  int4: 'Int',
  mediumint: 'Int',
  real: 'Float',
  float: 'Float',
  float4: 'Float',
  float8: 'Float',
  double: 'Float',
  'double precision': 'Float',
  boolean: 'Boolean',
  bool: 'Boolean',
  date: 'DateTime',
  datetime: 'DateTime',
  timestamp: 'DateTime',
  'timestamp without time zone': 'DateTime',
  'timestamp with time zone': 'DateTime',
  json: 'JSON',
  jsonb: 'JSON',
};

/**
 * GraphQL type of a column type as TypeORM reports it. Anything not listed
 * (text, uuid, enums, and bigint and numeric, which drivers return as strings
 * to keep their precision) is a String.
 */
export const graphqlType = (columnType: string) =>
  GRAPHQL_TYPES[columnType] ?? 'String';
