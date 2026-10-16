import type { ApolloDriverConfig } from '@nestjs/apollo';
import type { DatabaseConnection } from '../adapters/database-adapter.interface';
import { createResolvers, type PaginationSettings } from './resolvers';
import { createTypeDefs } from './type-defs';

export interface GraphQLSchemaParts {
  typeDefs: string;
  resolvers: ApolloDriverConfig['resolvers'];
}

/**
 * The whole GraphQL API of a connection: per table or collection, list,
 * count and by-key queries, create, update and delete mutations, and
 * relations from foreign keys.
 */
export const createSchema = (
  connection: DatabaseConnection,
  pagination: PaginationSettings,
): GraphQLSchemaParts => ({
  typeDefs: createTypeDefs(connection.models),
  resolvers: createResolvers(connection, pagination),
});
