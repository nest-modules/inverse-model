import DataLoader from 'dataloader';
import type {
  DatabaseConnection,
  DatabaseRecord,
  ModelDefinition,
  Where,
} from '../adapters/database-adapter.interface';

/** Values of the key columns, one per property; a single column for most keys. */
export type KeyValues = readonly unknown[];

type Loader = DataLoader<KeyValues, DatabaseRecord[], string>;

// One set of loaders per request, so batching never mixes requests and their cache dies with it.
const loadersByContext = new WeakMap<object, Map<string, Loader>>();

// Ids may come back as numbers or strings; both match as text.
const keyOf = (values: KeyValues) => JSON.stringify(values.map(String));

/** Matches the records whose `properties` equal any of `keys`. */
function whereAny(properties: string[], keys: readonly KeyValues[]): Where {
  if (properties.length === 1) {
    return { [properties[0]]: { in: keys.map((key) => key[0]) } };
  }
  return {
    OR: keys.map((key) => ({
      AND: properties.map((property, i) => ({ [property]: { eq: key[i] } })),
    })),
  };
}

/**
 * Keys a record is found under: one, or one per element when its single
 * key property holds an array of references.
 */
function keysOfRecord(record: DatabaseRecord, properties: string[]) {
  const value = record[properties[0]];
  if (properties.length === 1 && Array.isArray(value)) {
    return value.map((element) => keyOf([element]));
  }
  return [keyOf(properties.map((property) => record[property]))];
}

/**
 * Loads the records of `model` whose `properties` equal a key, batching every
 * key asked for in the same tick into one query.
 */
export function relationLoader(
  context: object,
  connection: DatabaseConnection,
  model: ModelDefinition,
  properties: string[],
): Loader {
  const loaders = loadersByContext.get(context) ?? new Map<string, Loader>();
  loadersByContext.set(context, loaders);

  const id = `${model.name}.${properties.join(',')}`;
  let loader = loaders.get(id);
  if (!loader) {
    loader = new DataLoader(
      async (keys) => {
        const records = await connection.find(model, {
          where: whereAny(properties, keys),
          orderBy: model.primaryKey.map((key) => ({ [key]: 'ASC' as const })),
        });
        const groups = new Map<string, DatabaseRecord[]>();
        for (const record of records) {
          for (const key of keysOfRecord(record, properties)) {
            groups.set(key, [...(groups.get(key) ?? []), record]);
          }
        }
        return keys.map((key) => groups.get(keyOf(key)) ?? []);
      },
      { cacheKeyFn: keyOf },
    );
    loaders.set(id, loader);
  }
  return loader;
}
