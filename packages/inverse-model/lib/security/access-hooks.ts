import { AsyncLocalStorage } from 'node:async_hooks';
import { GraphQLError } from 'graphql';
import type {
  DatabaseConnection,
  DatabaseRecord,
  ModelDefinition,
  Where,
} from '../adapters/database-adapter.interface';
import { mapWhere, modelsReadBy } from '../adapters/relation-where';
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
  /**
   * The filter with the scope of each related model ANDed into its relation
   * filters, so they never match rows the scope hides. `every` checks only
   * the related rows in scope.
   */
  const scopedRelations = (
    model: ModelDefinition,
    where: Where | null | undefined,
  ) =>
    mapWhere(where, model, connection.models, {
      async nested(target, inner, part) {
        const where = await scopeOf(target, 'list');
        if (!where) return inner;
        return part === 'every'
          ? { OR: [inner, { NOT: where }] }
          : { AND: [inner, where] };
      },
    });
  /** The filter of a read or delete: the scope ANDed in, relation filters included. */
  const scoped = async (
    model: ModelDefinition,
    where: Where | null | undefined,
    operation: InverseOperation,
  ) =>
    both(await scopedRelations(model, where), await scopeOf(model, operation));
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
    nullsFirst: connection.nullsFirst,
    find: async (model, args) =>
      connection.find(model, {
        ...args,
        where: await scoped(model, args.where, 'list'),
      }),
    count: async (model, where) =>
      connection.count(model, await scoped(model, where, 'count')),
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
    async upsert(model, input) {
      const where = await scopeOf(model, 'update');
      const key = Object.fromEntries(
        model.primaryKey.map((property) => [property, input[property]]),
      );
      const complete = Object.values(key).every((value) => value != null);
      // A row outside the scope is neither updated nor, as its key is taken, created.
      if (
        where &&
        complete &&
        (await connection.findOne(model, key)) &&
        !(await visible(model, key, where))
      ) {
        throw new GraphQLError(`Not allowed to update ${model.name}`, {
          extensions: { code: 'FORBIDDEN' },
        });
      }
      return connection.upsert(model, input);
    },
    insertMany: (model, inputs) => connection.insertMany(model, inputs),
    deleteMany: async (model, where) =>
      connection.deleteMany(model, await scoped(model, where, 'delete')),
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
  const check = async (
    model: ModelDefinition,
    operation: InverseOperation,
    context: unknown,
    args: Record<string, unknown>,
  ) => {
    const allowed =
      !authorize ||
      (await authorize({
        model: model.source,
        type: model.name,
        operation,
        context,
        args,
      }));
    if (!allowed) {
      throw new GraphQLError(`Not allowed to ${operation} ${model.name}`, {
        extensions: { code: 'FORBIDDEN' },
      });
    }
  };
  /**
   * Runs `authorize` for each operation of the field, and a `list` of every
   * model its relation filters read, before the resolver.
   */
  const guard =
    (
      resolve: Resolver,
      model: ModelDefinition,
      operations: InverseOperation[],
    ): Resolver =>
    async (parent, args, context, info) => {
      for (const operation of operations) {
        await check(model, operation, context, args ?? {});
      }
      if (authorize) {
        const where = (args?.where ?? null) as Where | null;
        for (const read of modelsReadBy(model, where, models)) {
          await check(read, 'list', context, args ?? {});
        }
      }
      return resolve(parent, args, context, info);
    };

  const byName = new Map(models.map((model) => [model.name, model]));
  const query = fieldsWithinRequest(resolvers.Query);
  const mutation = fieldsWithinRequest(resolvers.Mutation);
  const secured: ResolverMap = { ...resolvers, Query: query };

  for (const model of models) {
    const names = operationNames(model);
    // Each field asks for the operations it runs: a connection is a list, an
    // upsert may create or update, and batches create or delete.
    const queries: [string, InverseOperation[]][] = [
      [names.list, ['list']],
      [names.count, ['count']],
      [names.byPk, ['byPk']],
      [names.connection, ['list']],
    ];
    const mutations: [string, InverseOperation[]][] = [
      [names.create, ['create']],
      [names.update, ['update']],
      [names.delete, ['delete']],
      [names.upsert, ['create', 'update']],
      [names.createMany, ['create']],
      [names.deleteMany, ['delete']],
    ];
    for (const [field, operations] of queries) {
      const resolve = query[field];
      if (resolve) query[field] = guard(resolve, model, operations);
    }
    for (const [field, operations] of mutations) {
      const resolve = mutation[field];
      if (!resolve) continue;
      if (model.readOnly) delete mutation[field];
      else mutation[field] = guard(resolve, model, operations);
    }

    if (!resolvers[model.name]) continue;
    const fields = fieldsWithinRequest(resolvers[model.name]);
    for (const relation of model.relations) {
      const target = byName.get(relation.target);
      const resolve = fields[relation.property];
      if (target && resolve) {
        fields[relation.property] = guard(resolve, target, ['list']);
      }
    }
    secured[model.name] = fields;
  }

  if (Object.keys(mutation).length > 0) secured.Mutation = mutation;
  else delete secured.Mutation;
  return secured;
}
