import { AsyncLocalStorage } from 'node:async_hooks';
import { GraphQLError } from 'graphql';
import type {
  DatabaseConnection,
  DatabaseRecord,
  ModelDefinition,
  Where,
} from '../adapters/database-adapter.interface';
import { operationNames } from '../graphql/operation-names';
import type {
  InverseAuthorize,
  InverseOperation,
  InverseScope,
} from './security.interfaces';

/** The GraphQL context of the resolver running, so the connection can scope its queries. */
const requests = new AsyncLocalStorage<{ context: unknown }>();

const both = (a?: Where | null, b?: Where | null): Where | null | undefined =>
  a && b ? { AND: [a, b] } : (a ?? b);

const keyWhere = (key: DatabaseRecord): Where => ({
  AND: Object.entries(key).map(([property, value]) => ({
    [property]: { eq: value },
  })),
});

/**
 * The connection with `scope` ANDed into every read, update and delete,
 * evaluated for the GraphQL context of the resolver making the call. Calls
 * made outside a resolver are refused.
 */
export function withScope(
  connection: DatabaseConnection,
  scope: InverseScope | undefined,
): DatabaseConnection {
  if (!scope) return connection;

  const scopeOf = async (
    model: ModelDefinition,
    operation: InverseOperation,
  ) => {
    const request = requests.getStore();
    if (!request) {
      throw new Error(`No GraphQL request to scope ${model.name} with`);
    }
    const where = await scope({
      model: model.source,
      type: model.name,
      operation,
      context: request.context,
    });
    return where && Object.keys(where).length > 0 ? where : null;
  };
  /** Whether the row with `key` is within `where`. */
  const visible = async (
    model: ModelDefinition,
    key: DatabaseRecord,
    where: Where,
  ) =>
    (
      await connection.find(model, {
        where: both(keyWhere(key), where),
        limit: 1,
      })
    )[0] ?? null;

  return {
    models: connection.models,
    find: async (model, args) =>
      connection.find(model, {
        ...args,
        where: both(args.where, await scopeOf(model, 'list')),
      }),
    count: async (model, where) =>
      connection.count(model, both(where, await scopeOf(model, 'count'))),
    async findOne(model, key) {
      const where = await scopeOf(model, 'byPk');
      return where
        ? visible(model, key, where)
        : connection.findOne(model, key);
    },
    insert: (model, input) => connection.insert(model, input),
    async update(model, key, input) {
      const where = await scopeOf(model, 'update');
      if (where && !(await visible(model, key, where))) return null;
      return connection.update(model, key, input);
    },
    async delete(model, key) {
      const where = await scopeOf(model, 'delete');
      if (where && !(await visible(model, key, where))) return null;
      return connection.delete(model, key);
    },
    ...(connection.transaction && {
      // Writes run with hooks go through the transaction's connection, so it is scoped too.
      transaction: (work) =>
        (connection.transaction as NonNullable<typeof connection.transaction>)(
          (transaction) =>
            work({
              ...transaction,
              connection: withScope(transaction.connection, scope),
            }),
        ),
    }),
    close: () => connection.close(),
  };
}

type Resolver = (
  parent: unknown,
  args: Record<string, unknown>,
  context: unknown,
  info: unknown,
) => unknown;
type ResolverMap = Record<string, unknown>;

/** Runs a resolver within its request, so `withScope` knows whose it is. */
const withinRequest =
  (resolve: Resolver): Resolver =>
  (parent, args, context, info) =>
    requests.run({ context }, () => resolve(parent, args, context, info));

/** A copy of a type's resolver map with every function resolver run within its request. */
const fieldsWithinRequest = (fields: unknown) =>
  Object.fromEntries(
    Object.entries((fields ?? {}) as Record<string, unknown>).map(
      ([name, resolve]) => [
        name,
        typeof resolve === 'function'
          ? withinRequest(resolve as Resolver)
          : resolve,
      ],
    ),
  ) as Record<string, Resolver>;

/**
 * Wraps the generated resolvers so each runs within its request for
 * `withScope`, the operations of every model run `authorize` first, and the
 * mutations of read-only models are dropped.
 */
export function secureResolvers(
  resolvers: ResolverMap,
  models: readonly ModelDefinition[],
  authorize: InverseAuthorize | undefined,
): ResolverMap {
  const guard =
    (
      resolve: Resolver,
      model: ModelDefinition,
      operation: InverseOperation,
    ): Resolver =>
    async (parent, args, context, info) => {
      const allowed =
        !authorize ||
        (await authorize({
          model: model.source,
          type: model.name,
          operation,
          context,
          args: args ?? {},
        }));
      if (!allowed) {
        throw new GraphQLError(`Not allowed to ${operation} ${model.name}`, {
          extensions: { code: 'FORBIDDEN' },
        });
      }
      return resolve(parent, args, context, info);
    };

  const byName = new Map(models.map((model) => [model.name, model]));
  const query = fieldsWithinRequest(resolvers.Query);
  const mutation = fieldsWithinRequest(resolvers.Mutation);
  const secured: ResolverMap = { ...resolvers, Query: query };

  for (const model of models) {
    const names = operationNames(model);
    for (const operation of ['list', 'count', 'byPk'] as const) {
      const resolve = query[names[operation]];
      if (resolve) query[names[operation]] = guard(resolve, model, operation);
    }
    for (const operation of ['create', 'update', 'delete'] as const) {
      const resolve = mutation[names[operation]];
      if (!resolve) continue;
      if (model.readOnly) delete mutation[names[operation]];
      else mutation[names[operation]] = guard(resolve, model, operation);
    }

    if (!resolvers[model.name]) continue;
    const fields = fieldsWithinRequest(resolvers[model.name]);
    for (const relation of model.relations) {
      const target = byName.get(relation.target);
      const resolve = fields[relation.property];
      if (target && resolve) {
        fields[relation.property] = guard(resolve, target, 'list');
      }
    }
    secured[model.name] = fields;
  }

  if (Object.keys(mutation).length > 0) secured.Mutation = mutation;
  else delete secured.Mutation;
  return secured;
}
