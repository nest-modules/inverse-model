import type { ApolloDriverConfig } from '@nestjs/apollo';
import type { SslOptions } from './adapters/database-adapter.interface';
import type {
  InverseAuthorize,
  InverseQueryLimits,
  InverseScope,
} from './security/security.interfaces';

export type {
  FieldFilter,
  Where,
} from './adapters/database-adapter.interface';
export type * from './security/security.interfaces';
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
  /**
   * Tables or collections, and `table.column` fields, to expose; everything
   * when not given. `*` matches any name, e.g. `audit_*` or `users.*`.
   */
  include?: string[];
  /** Tables and `table.column` fields to hide, e.g. `*.password`; wins over `include`. */
  exclude?: string[];
  /** True, or the tables that get no create, update or delete mutations. */
  readOnly?: boolean | string[];
  /** Depth and cost limits checked before a query runs. */
  queryLimits?: InverseQueryLimits;
  /** Decides whether a request may run an operation; false answers FORBIDDEN. */
  authorize?: InverseAuthorize;
  /** Extra filter ANDed into every read, update and delete of a model, e.g. per tenant. */
  scope?: InverseScope;
}
