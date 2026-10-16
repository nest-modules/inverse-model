import { GraphQLScalarType, Kind, valueFromASTUntyped } from 'graphql';

function toDate(value: unknown): Date {
  const date =
    value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`DateTime cannot represent ${String(value)}`);
  }
  return date;
}

/**
 * ISO 8601 date and time. Serializes Dates and the ISO strings they turn
 * into in the cache, and parses input into Dates.
 */
export const GraphQLDateTime = new GraphQLScalarType({
  name: 'DateTime',
  serialize: (value) => toDate(value).toISOString(),
  parseValue: toDate,
  parseLiteral: (ast) => {
    if (ast.kind !== Kind.STRING) {
      throw new TypeError('DateTime must be an ISO 8601 string');
    }
    return toDate(ast.value);
  },
});

/** Any JSON value, for json and jsonb columns. */
export const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => valueFromASTUntyped(ast),
});
