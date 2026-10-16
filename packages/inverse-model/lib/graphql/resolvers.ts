import type {
  DatabaseConnection,
  DatabaseRecord,
  FindArgs,
  ModelDefinition,
  RelationDefinition,
  Where,
} from '../adapters/database-adapter.interface';
import { createWrites, type Writes } from '../hooks/writes';
import { batchMutations } from './batch-mutations';
import { connectionQuery } from './connection';
import { operationNames } from './operation-names';
import { relationLoader } from './relation-loader';
import { GraphQLDateTime, GraphQLJSON } from './scalars';
import { updatableFields } from './type-defs';

export interface PaginationSettings {
  /** Rows returned when a list asks for no `limit`. */
  defaultLimit: number;
  /** Largest `limit` a list may ask for. */
  maxLimit: number;
}

export type Resolver = (
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
  writes: Writes = createWrites(connection),
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
      const values = relation.fields.map((field) => parent[field]);
      if (values.some((value) => value === null || value === undefined)) {
        return relation.kind === 'one' ? null : [];
      }
      // A single key holding an array references one record per element.
      const elements = Array.isArray(values[0])
        ? (values[0] as unknown[])
        : null;

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
            ...relation.references.map((reference, i) => ({
              [reference]: elements ? { in: elements } : { eq: values[i] },
            })),
            ...(listArgs.where ? [listArgs.where] : []),
          ],
        };
        return connection.find(target, page(target, { ...listArgs, where }));
      }

      const loader = relationLoader(
        contextOf(context),
        connection,
        target,
        relation.references,
      );
      const records = elements
        ? (await loader.loadMany(elements.map((element) => [element]))).flatMap(
            (found) => (found instanceof Error ? [] : found),
          )
        : await loader.load(values);
      return relation.kind === 'one'
        ? (records[0] ?? null)
        : records.slice(0, pagination.maxLimit);
    };
  }

  const relationResolvers = (model: ModelDefinition) =>
    Object.fromEntries(
      model.relations.map((relation) => [
        relation.property,
        relationResolver(relation),
      ]),
    );

  const Query: Record<string, Resolver> = { health: () => 'ok' };
  const Mutation: Record<string, Resolver> = {};
  const types: Record<string, Record<string, Resolver>> = {};

  for (const model of connection.models) {
    const names = operationNames(model);
    Query[names.list] = (_parent, args) =>
      connection.find(model, page(model, args as ListArgs));
    Query[names.count] = (_parent, args) =>
      connection.count(model, args.where as Where | undefined);
    Object.assign(Query, connectionQuery(connection, model, pagination));
    if (model.primaryKey.length > 0) {
      Query[names.byPk] = (_parent, args) =>
        connection.findOne(model, keyOf(model, args));
    }
    types[model.name] = relationResolvers(model);
    if (model.readOnly) continue;

    Mutation[names.create] = (_parent, args, context) =>
      writes.create(model, args.input as DatabaseRecord, context);
    if (model.primaryKey.length > 0) {
      // A table whose columns are all key, like a join table, has nothing to update.
      if (updatableFields(model).length > 0) {
        Mutation[names.update] = (_parent, args, context) =>
          writes.update(
            model,
            keyOf(model, args),
            args.input as DatabaseRecord,
            context,
          );
      }
      Mutation[names.delete] = (_parent, args, context) =>
        writes.delete(model, keyOf(model, args), context);
    }
    Object.assign(
      Mutation,
      batchMutations(connection, model, pagination, writes),
    );
  }

  return {
    DateTime: GraphQLDateTime,
    JSON: GraphQLJSON,
    Query,
    ...(Object.keys(Mutation).length > 0 ? { Mutation } : {}),
    ...types,
  };
}
