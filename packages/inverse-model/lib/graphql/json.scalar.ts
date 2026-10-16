import { GraphQLScalarType, valueFromASTUntyped } from 'graphql';

/** Any JSON value, for json and jsonb columns. */
export const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => valueFromASTUntyped(ast),
});
