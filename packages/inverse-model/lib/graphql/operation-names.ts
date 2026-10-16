import type { ModelDefinition } from '../adapters/database-adapter.interface';
import { camelCase } from '../utils/naming';

/** Names of the queries and mutations of a model, e.g. `blogPosts` and `createBlogPosts`. */
export function operationNames(model: ModelDefinition) {
  const list = camelCase(model.name);
  return {
    list,
    count: `${list}Count`,
    byPk: `${list}ByPk`,
    create: `create${model.name}`,
    update: `update${model.name}`,
    delete: `delete${model.name}`,
  };
}
