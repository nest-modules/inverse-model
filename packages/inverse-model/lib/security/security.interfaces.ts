import type { Where } from '../adapters/database-adapter.interface';

/** What a generated query or mutation does to its model. */
export type InverseOperation =
  | 'list'
  | 'count'
  | 'byPk'
  | 'create'
  | 'update'
  | 'delete';

/** Passed to `authorize` and `scope`. */
export interface InverseAccessRequest<TContext = any> {
  /** Table or collection name, e.g. `blog_posts` (`public.blog_posts` on PostgreSQL). */
  model: string;
  /** GraphQL type name, e.g. `BlogPosts`. */
  type: string;
  /** Relation fields are read as a `list` of the model they point at. */
  operation: InverseOperation;
  /** The GraphQL context, `{ req }` unless `graphql.context` says otherwise. */
  context: TContext;
}

export type InverseAuthorize<TContext = any> = (
  request: InverseAccessRequest<TContext> & {
    /** Arguments of the field, e.g. `input` of a create. */
    args: Record<string, unknown>;
  },
) => boolean | Promise<boolean>;

/** Extra filter ANDed into every read, update and delete; null or undefined adds none. */
export type InverseScope<TContext = any> = (
  request: InverseAccessRequest<TContext>,
) => Where | null | undefined | Promise<Where | null | undefined>;

export interface InverseQueryLimits {
  /** Deepest nesting of fields a query may have. Defaults to 10. */
  maxDepth?: number;
  /**
   * Largest estimated cost of a query: every field costs 1, and the fields
   * inside a list cost as many times as the rows it may return (its `limit`,
   * or the default page size). Defaults to 50000.
   */
  maxComplexity?: number;
}
