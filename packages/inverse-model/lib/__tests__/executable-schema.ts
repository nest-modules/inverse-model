import {
  buildSchema,
  type GraphQLFieldResolver,
  GraphQLObjectType,
  GraphQLScalarType,
} from 'graphql';
import type { DatabaseConnection } from '../adapters/database-adapter.interface';
import { createSchema } from '../graphql/create-schema';
import type { PaginationSettings } from '../graphql/resolvers';

/** A runnable schema from the SDL and resolvers, as Apollo would build it. */
export function executableSchema(
  connection: DatabaseConnection,
  pagination: PaginationSettings = { defaultLimit: 2, maxLimit: 3 },
) {
  const { typeDefs, resolvers } = createSchema(connection, pagination);
  const schema = buildSchema(typeDefs);
  for (const [typeName, value] of Object.entries(
    resolvers as Record<string, unknown>,
  )) {
    const type = schema.getType(typeName);
    if (type instanceof GraphQLScalarType) {
      Object.assign(type, value);
    } else if (type instanceof GraphQLObjectType) {
      const fields = type.getFields();
      for (const [name, resolve] of Object.entries(
        value as Record<string, GraphQLFieldResolver<unknown, unknown>>,
      )) {
        fields[name].resolve = resolve;
      }
    }
  }
  return schema;
}
