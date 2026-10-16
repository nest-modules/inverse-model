import { createHash } from 'node:crypto';
import type {
  DatabaseConnection,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import type { CacheStore } from './cache-store.interface';

export interface CacheSettings {
  /** Seconds a result is kept; 0 turns the cache off. */
  ttl: number;
  /** Per-table TTL in seconds, keyed by table or collection name. */
  ttlByTable: Readonly<Record<string, number>>;
  keyPrefix: string;
  /** Called when the store fails; the query then goes to the database. */
  onError: (error: unknown) => void;
}

const hash = (value: unknown) =>
  createHash('sha1').update(JSON.stringify(value)).digest('hex');

/**
 * Wraps a connection so reads are cached per table. Every write to a table
 * bumps that table's version, which is part of each key, so its cached
 * results are never read again and expire on their own.
 */
export function withCache(
  connection: DatabaseConnection,
  store: CacheStore,
  settings: CacheSettings,
): DatabaseConnection {
  const ttlOf = (model: ModelDefinition) =>
    settings.ttlByTable[model.source] ?? settings.ttl;
  const versionKey = (model: ModelDefinition) =>
    `${settings.keyPrefix}${model.source}:version`;

  async function cached<T>(
    model: ModelDefinition,
    operation: string,
    args: unknown,
    read: () => Promise<T>,
  ): Promise<T> {
    const ttl = ttlOf(model);
    if (ttl <= 0) return read();

    let key: string;
    try {
      const version = (await store.get(versionKey(model))) ?? '0';
      key = `${settings.keyPrefix}${model.source}:${version}:${operation}:${hash(args)}`;
      const hit = await store.get(key);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (error) {
      settings.onError(error);
      return read();
    }

    const result = await read();
    store
      .set(key, JSON.stringify(result), ttl)
      .catch((error) => settings.onError(error));
    return result;
  }

  async function written<T>(model: ModelDefinition, write: () => Promise<T>) {
    const result = await write();
    await store
      .increment(versionKey(model))
      .catch((error) => settings.onError(error));
    return result;
  }

  return {
    models: connection.models,
    find: (model, args) =>
      cached(model, 'find', args, () => connection.find(model, args)),
    count: (model, where) =>
      cached(model, 'count', where ?? null, () =>
        connection.count(model, where),
      ),
    findOne: (model, key) =>
      cached(model, 'findOne', key, () => connection.findOne(model, key)),
    insert: (model, input) =>
      written(model, () => connection.insert(model, input)),
    update: (model, key, input) =>
      written(model, () => connection.update(model, key, input)),
    delete: (model, key) => written(model, () => connection.delete(model, key)),
    async close() {
      await Promise.all([connection.close(), store.close()]);
    },
  };
}
