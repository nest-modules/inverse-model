import type {
  DatabaseRecord,
  DatabaseTransaction,
  ModelDefinition,
} from '../adapters/database-adapter.interface';

// The GraphQL context is whatever the app puts in it.
type AnyContext = any;

type MaybePromise<T> = T | Promise<T>;
// biome-ignore lint/suspicious/noConfusingVoidType: so hooks that return nothing type-check.
type NoChange = void | undefined | null;

/** What a write hook receives. Records and inputs are keyed by GraphQL property. */
export interface WriteHookArgs<TContext = AnyContext> {
  /** Model being written: its GraphQL name, its table or collection (`source`) and fields. */
  model: ModelDefinition;
  /** Values to write, as changed by the before-hooks that ran so far; empty on delete. */
  input: DatabaseRecord;
  /** Primary key of the record; null before a create, or for a table without one. */
  key: DatabaseRecord | null;
  /**
   * Before a create, null. Before an update or a delete, the record as it is.
   * After a create or an update, the record as written; after a delete, the
   * record deleted.
   */
  record: DatabaseRecord | null;
  /** GraphQL context of the request, e.g. `{ req }`. */
  context: TContext;
  /** The transaction of the write; queries through it commit or roll back with the write. */
  transaction: DatabaseTransaction;
}

/**
 * Runs before a write. Returning an object writes that instead of the input;
 * returning nothing keeps it. Throwing aborts the write with that error.
 */
export type BeforeWriteHook<TContext = AnyContext> = (
  args: WriteHookArgs<TContext>,
) => MaybePromise<DatabaseRecord | NoChange>;

/** Runs after a write, before it commits. Throwing rolls the write back. */
export type AfterWriteHook<TContext = AnyContext> = (
  args: WriteHookArgs<TContext>,
) => unknown;

type OneOrMany<T> = T | T[];

export interface TableWriteHooks<TContext = AnyContext> {
  beforeCreate?: OneOrMany<BeforeWriteHook<TContext>>;
  afterCreate?: OneOrMany<AfterWriteHook<TContext>>;
  beforeUpdate?: OneOrMany<BeforeWriteHook<TContext>>;
  afterUpdate?: OneOrMany<AfterWriteHook<TContext>>;
  beforeDelete?: OneOrMany<BeforeWriteHook<TContext>>;
  afterDelete?: OneOrMany<AfterWriteHook<TContext>>;
}

/**
 * Hooks per table or collection name, e.g. `blog_posts`, and `*` for every
 * one. For each step the `*` hooks run first, then the table's, in order.
 */
export type InverseHooks<TContext = AnyContext> = Record<
  string,
  TableWriteHooks<TContext>
>;
