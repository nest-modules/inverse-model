import type { ModelDefinition } from '../adapters/database-adapter.interface';
import { lowerFirst, pluralOf } from '../utils/naming';

/**
 * Names of the queries and mutations of a model, e.g. `blogPosts`,
 * `blogPost` and `createBlogPost`. A type whose plural is the type itself
 * (`News`) gets `newsByPk` so the by-key query keeps a name of its own.
 */
export function operationNames(model: ModelDefinition) {
  const plural = pluralOf(model);
  const list = lowerFirst(plural);
  const single = lowerFirst(model.name);
  return {
    list,
    count: `${list}Count`,
    byPk: single === list ? `${single}ByPk` : single,
    connection: `${list}Connection`,
    create: `create${model.name}`,
    update: `update${model.name}`,
    delete: `delete${model.name}`,
    upsert: `upsert${model.name}`,
    createMany: `createMany${plural}`,
    deleteMany: `deleteMany${plural}`,
  };
}
