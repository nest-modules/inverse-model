import type { ModelDefinition } from '../adapters/database-adapter.interface';
import { lowerFirst, pluralOf } from '../utils/naming';

/**
 * Names of the queries and mutations of a model, e.g. `blogPosts`,
 * `blogPost` and `createBlogPost`. A type whose plural is the type itself
 * (`News`) gets `newsByPk` so the by-key query keeps a name of its own.
 */
export function operationNames(model: ModelDefinition) {
  const list = lowerFirst(pluralOf(model));
  const single = lowerFirst(model.name);
  return {
    list,
    count: `${list}Count`,
    byPk: single === list ? `${single}ByPk` : single,
    create: `create${model.name}`,
    update: `update${model.name}`,
    delete: `delete${model.name}`,
  };
}
