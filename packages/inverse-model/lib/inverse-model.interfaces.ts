import type { ApolloDriverConfig } from '@nestjs/apollo';
import type { SslOptions } from './adapters/database-adapter.interface';

export type { SslOptions };

export interface InverseCacheOptions {
  /** Redis connection string, e.g. `redis://localhost:6379`. Needs the `ioredis` package. */
  url: string;
  /** Seconds a query result is kept. Defaults to 60. */
  ttl?: number;
  /** TTL in seconds per table or collection name; 0 leaves that table uncached. */
  ttlByTable?: Record<string, number>;
  /** Prefix of every key the cache writes. Defaults to `inverse:`. */
  keyPrefix?: string;
}

export interface InversePaginationOptions {
  /** Rows a list returns when it asks for no `limit`. Defaults to 100. */
  defaultLimit?: number;
  /** Largest `limit` a list may ask for. Defaults to 1000. */
  maxLimit?: number;
}

export interface InverseModelOptions {
  /**
   * Connection string of the database to expose; its protocol picks the
   * database: `postgres://`, `mysql://`, `mariadb://`, `mssql://` or `mongodb://`.
   */
  url: string;
  /** TLS for the database connection; true uses the driver's defaults. */
  ssl?: boolean | SslOptions;
  /** Caches query results in Redis; every mutation clears its table's results. */
  cache?: InverseCacheOptions;
  pagination?: InversePaginationOptions;
  /** Overrides for the Apollo server; the schema itself always comes from the database. */
  graphql?: Omit<ApolloDriverConfig, 'driver' | 'typeDefs' | 'resolvers'>;
}
