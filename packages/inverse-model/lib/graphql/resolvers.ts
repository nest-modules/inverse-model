import type {
  DatabaseConnection,
  DatabaseRecord,
  FindArgs,
  ModelDefinition,
  RelationDefinition,
  Where,
} from '../adapters/database-adapter.interface';
import { operationNames } from './operation-names';
import { relationLoader } from './relation-loader';
import { GraphQLDateTime, GraphQLJSON } from './scalars';

export interface PaginationSettings {
  /** Rows returned when a list asks for no `limit`. */
  defaultLimit: number;
  /** Largest `limit` a list may ask for. */
  maxLimit: number;
}

type Resolver = (
  parent: DatabaseRecord,
  args: Record<string, unknown>,
  context: object,
) => unknown;

type ListArgs = FindArgs;

// A context-less call (e.g. a unit test) still needs an object to key loaders on.
const contextOf = (context: unknown) =>
  typeof context === 'object' && context !== null ? context : {};

export function createResolvers(
  connection: DatabaseConnection,
  pagination: PaginationSettings,
) {
  const models = new Map(connection.models.map((model) => [model.name, model]));

  /** Clamps the page and, without an order, sorts by primary key so pages are stable. */
  const page = (model: ModelDefinition, args: ListArgs): FindArgs => ({
    where: args.where,
    orderBy:
      args.orderBy && args.orderBy.length > 0
        ? args.orderBy
        : model.primaryKey.map((key) => ({ [key]: 'ASC' as const })),
    limit: Math.max(
      0,
      Math.min(args.limit ?? pagination.defaultLimit, pagination.maxLimit),
    ),
    offset: Math.max(0, args.offset ?? 0),
  });

  const keyOf = (model: ModelDefinition, args: Record<string, unknown>) =>
    Object.fromEntries(model.primaryKey.map((key) => [key, args[key]]));

  function relationResolver(relation: RelationDefinition): Resolver {
    const target = models.get(relation.target) as ModelDefinition;
    return async (parent, args, context) => {
      const value = parent[relation.field];
      if (value === null || value === undefined) {
        return relation.kind === 'one' ? null : [];
      }

      const listArgs = args as ListArgs;
      const filtered =
        listArgs.where ||
        listArgs.orderBy ||
        listArgs.limit !== undefined ||
        listArgs.offset !== undefined;
      if (relation.kind === 'many' && filtered) {
        // A filtered or paged list cannot share a batch with its siblings.
        const where: Where = {
          AND: [
            { [relation.reference]: { eq: value } },
            ...(listArgs.where ? [listArgs.where] : []),
          ],
        };
        return connection.find(target, page(target, { ...listArgs, where }));
      }

      const records = await relationLoader(
        contextOf(context),
        connection,
        target,
        relation.reference,
      ).load(value);
      return relation.kind === 'one'
        ? (records[0] ?? null)
        : records.slice(0, pagination.maxLimit);
    };
  }

  const Query: Record<string, Resolver> = { health: () => 'ok' };
  const Mutation: Record<string, Resolver> = {};
  const types: Record<string, Record<string, Resolver>> = {};

  for (const model of connection.models) {
    const names = operationNames(model);
    Query[names.list] = (_parent, args) =>
      connection.find(model, page(model, args as ListArgs));
    Query[names.count] = (_parent, args) =>
      connection.count(model, args.where as Where | undefined);
    Mutation[names.create] = (_parent, args) =>
      connection.insert(model, args.input as DatabaseRecord);

    if (model.primaryKey.length > 0) {
      Query[names.byPk] = (_parent, args) =>
        connection.findOne(model, keyOf(model, args));
      Mutation[names.update] = (_parent, args) =>
        connection.update(
          model,
          keyOf(model, args),
          args.input as DatabaseRecord,
        );
      Mutation[names.delete] = (_parent, args) =>
        connection.delete(model, keyOf(model, args));
    }

    types[model.name] = Object.fromEntries(
      model.relations.map((relation) => [
        relation.property,
        relationResolver(relation),
      ]),
    );
  }

  return {
    DateTime: GraphQLDateTime,
    JSON: GraphQLJSON,
    Query,
    ...(connection.models.length > 0 ? { Mutation } : {}),
    ...types,
  };
}
