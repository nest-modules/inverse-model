import DataLoader from 'dataloader';
import type {
  DatabaseConnection,
  DatabaseRecord,
  ModelDefinition,
} from '../adapters/database-adapter.interface';

type Loader = DataLoader<unknown, DatabaseRecord[], string>;

// One set of loaders per request, so batching never mixes requests and their cache dies with it.
const loadersByContext = new WeakMap<object, Map<string, Loader>>();

/**
 * Loads the records of `model` whose `property` equals a key, batching every
 * key asked for in the same tick into one `in` query.
 */
export function relationLoader(
  context: object,
  connection: DatabaseConnection,
  model: ModelDefinition,
  property: string,
): Loader {
  const loaders = loadersByContext.get(context) ?? new Map<string, Loader>();
  loadersByContext.set(context, loaders);

  const id = `${model.name}.${property}`;
  let loader = loaders.get(id);
  if (!loader) {
    loader = new DataLoader(
      async (keys) => {
        const records = await connection.find(model, {
          where: { [property]: { in: [...keys] } },
          orderBy: model.primaryKey.map((key) => ({ [key]: 'ASC' as const })),
        });
        const groups = new Map<string, DatabaseRecord[]>();
        for (const record of records) {
          const key = String(record[property]);
          groups.set(key, [...(groups.get(key) ?? []), record]);
        }
        return keys.map((key) => groups.get(String(key)) ?? []);
      },
      // Ids may come back as numbers or strings; both match as text.
      { cacheKeyFn: (key) => String(key) },
    );
    loaders.set(id, loader);
  }
  return loader;
}
