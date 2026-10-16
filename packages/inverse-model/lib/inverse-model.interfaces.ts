import type { ApolloDriverConfig } from '@nestjs/apollo';

export interface InverseModelOptions {
  /** Connection string of the database to expose, e.g. `postgres://user:pass@host/db`. */
  url: string;
  /** Overrides for the Apollo server; the schema itself always comes from the database. */
  graphql?: Omit<ApolloDriverConfig, 'driver' | 'typeDefs' | 'resolvers'>;
}
