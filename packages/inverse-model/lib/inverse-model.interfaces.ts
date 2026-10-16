import type { ApolloDriverConfig } from '@nestjs/apollo';
import type { DatabaseAdapter } from './adapters/database-adapter.interface';

export interface InverseModelOptions {
  /** Connection string of the database to expose, e.g. `postgres://user:pass@host/db`. */
  url: string;
  /**
   * Adapters for databases not built in, or to replace one. They are tried
   * before the built-in postgres, mysql, mariadb and mongodb adapters.
   */
  adapters?: DatabaseAdapter[];
  /** Overrides for the Apollo server; the schema itself always comes from the database. */
  graphql?: Omit<ApolloDriverConfig, 'driver' | 'typeDefs' | 'resolvers'>;
}
