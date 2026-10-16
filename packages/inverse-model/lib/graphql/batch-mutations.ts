import type {
  DatabaseConnection,
  DatabaseRecord,
  ModelDefinition,
  Where,
} from '../adapters/database-adapter.interface';
import type { Writes } from '../hooks/writes';
import { operationNames } from './operation-names';
import type { PaginationSettings, Resolver } from './resolvers';

/** Upsert and batch mutation fields of a writable model; upsert and deleteMany need a primary key. */
export function batchMutationFields(model: ModelDefinition): string[] {
  if (model.readOnly) return [];
  const names = operationNames(model);
  const { name } = model;
  const fields = [`${names.createMany}(inputs: [Create${name}Input!]!): Int!`];
  if (model.primaryKey.length > 0) {
    fields.unshift(`${names.upsert}(input: Create${name}Input!): ${name}!`);
    fields.push(`${names.deleteMany}(where: ${name}Where!): Int!`);
  }
  return fields;
}

/**
 * Resolvers of the fields above. A batch touches at most `maxLimit` records,
 * so a mistaken filter cannot wipe a table.
 */
export function batchMutations(
  connection: DatabaseConnection,
  model: ModelDefinition,
  { maxLimit }: PaginationSettings,
  writes: Writes,
): Record<string, Resolver> {
  if (model.readOnly) return {};
  const names = operationNames(model);
  const mutations: Record<string, Resolver> = {
    [names.createMany]: async (_parent, args, context) => {
      const inputs = args.inputs as DatabaseRecord[];
      if (inputs.length > maxLimit) {
        throw new Error(
          `${names.createMany} takes at most ${maxLimit} inputs, got ${inputs.length}`,
        );
      }
      return inputs.length > 0 ? writes.createMany(model, inputs, context) : 0;
    },
  };
  if (model.primaryKey.length > 0) {
    mutations[names.upsert] = (_parent, args, context) =>
      writes.upsert(model, args.input as DatabaseRecord, context);
    mutations[names.deleteMany] = async (_parent, args, context) => {
      const where = args.where as Where;
      const count = await connection.count(model, where);
      if (count > maxLimit) {
        throw new Error(
          `${names.deleteMany} would delete ${count} records, more than the limit of ${maxLimit}`,
        );
      }
      return count > 0 ? writes.deleteMany(model, where, context) : 0;
    };
  }
  return mutations;
}
