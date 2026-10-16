import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  DatabaseConnection,
  ModelDefinition,
  SortDirection,
  Where,
} from '../adapters/database-adapter.interface';
import {
  afterCursor,
  cursorOrder,
  decodeCursor,
  encodeCursor,
  reverseOrder,
} from './cursor';
import { operationNames } from './operation-names';
import type { PaginationSettings, Resolver } from './resolvers';

export const PAGE_INFO_TYPE_DEFS = `type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}`;

/** Cursors need a primary key to give every row its own place. */
export const hasConnection = (model: ModelDefinition) =>
  model.primaryKey.length > 0;

/** The `<list>Connection` query field; null for a model without a primary key. */
export function connectionField(
  model: ModelDefinition,
  hasOrderBy: boolean,
): string | null {
  if (!hasConnection(model)) return null;
  const orderBy = hasOrderBy ? `, orderBy: [${model.name}OrderBy!]` : '';
  return `${operationNames(model).connection}(where: ${model.name}Where${orderBy}, first: Int, after: String, last: Int, before: String): ${model.name}Connection!`;
}

export function connectionTypeDefs(model: ModelDefinition): string[] {
  if (!hasConnection(model)) return [];
  const { name } = model;
  return [
    `type ${name}Connection {\n  edges: [${name}Edge!]!\n  pageInfo: PageInfo!\n  totalCount: Int!\n}`,
    `type ${name}Edge {\n  cursor: String!\n  node: ${name}!\n}`,
  ];
}

interface ConnectionArgs {
  where?: Where | null;
  orderBy?: Record<string, SortDirection | null>[] | null;
  first?: number | null;
  after?: string | null;
  last?: number | null;
  before?: string | null;
}

/**
 * Relay-style cursor pagination: `first` records after the cursor `after`,
 * or the `last` ones before `before`, sorted by `orderBy` and the primary key.
 */
export function connectionQuery(
  connection: DatabaseConnection,
  model: ModelDefinition,
  pagination: PaginationSettings,
): Record<string, Resolver> {
  if (!hasConnection(model)) return {};
  const size = (requested: number | null | undefined) =>
    Math.max(
      0,
      Math.min(requested ?? pagination.defaultLimit, pagination.maxLimit),
    );

  const resolve: Resolver = async (_parent, args) => {
    const { where, orderBy, first, after, last, before } =
      args as ConnectionArgs;
    const withinResolver = AsyncLocalStorage.snapshot();
    const order = cursorOrder(model, orderBy);
    const conditions: Where[] = where ? [where] : [];
    if (after) {
      const values = decodeCursor(after, order, model);
      conditions.push(afterCursor(model, order, values, connection.nullsFirst));
    }
    if (before) {
      const values = decodeCursor(before, order, model);
      conditions.push(
        afterCursor(model, reverseOrder(order), values, connection.nullsFirst),
      );
    }

    // Only `last` reads backwards: from the end, in reverse order.
    const backward = last !== undefined && last !== null && !first;
    const limit = size(backward ? last : first);
    const records = await connection.find(model, {
      where: conditions.length > 0 ? { AND: conditions } : null,
      orderBy: (backward ? reverseOrder(order) : order).map(
        ([property, direction]) => ({ [property]: direction }),
      ),
      limit: limit + 1,
    });
    const hasMore = records.length > limit;
    let nodes = records.slice(0, limit);
    if (backward) nodes.reverse();
    // `first` and `last` together keep the last ones of the first page.
    const read = nodes.length;
    if (!backward && last !== undefined && last !== null) {
      nodes = nodes.slice(Math.max(0, read - size(last)));
    }

    const edges = nodes.map((node) => ({
      cursor: encodeCursor(order, node),
      node,
    }));
    return {
      edges,
      pageInfo: {
        hasNextPage: backward ? Boolean(before) : hasMore,
        hasPreviousPage: backward
          ? hasMore
          : Boolean(after) || nodes.length < read,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges[edges.length - 1]?.cursor ?? null,
      },
      // Only counted when asked for, in the context of this resolver (e.g. its request's scope).
      totalCount: () => withinResolver(() => connection.count(model, where)),
    };
  };
  return { [operationNames(model).connection]: resolve };
}
