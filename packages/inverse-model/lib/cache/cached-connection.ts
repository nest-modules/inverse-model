import { createHash } from 'node:crypto';
import type {
  DatabaseConnection,
  DatabaseTransaction,
  ModelDefinition,
  Where,
} from '../adapters/database-adapter.interface';
import { modelsReadBy } from '../adapters/relation-where';
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
  const begin = connection.transaction?.bind(connection);

  async function cached<T>(
    model: ModelDefinition,
    operation: string,
    args: unknown,
    read: () => Promise<T>,
    where?: Where | null,
  ): Promise<T> {
    const ttl = ttlOf(model);
    if (ttl <= 0) return read();

    let key: string;
    try {
      const version = (await store.get(versionKey(model))) ?? '0';
      // A relation filter reads other tables too, so their writes must miss it as well.
      const others = [...modelsReadBy(model, where, connection.models)];
      const otherVersions = await Promise.all(
        others.map(
          async (other) =>
            `${other.source}@${(await store.get(versionKey(other))) ?? '0'}`,
        ),
      );
      const versions = [version, ...otherVersions].join(',');
      key = `${settings.keyPrefix}${model.source}:${versions}:${operation}:${hash(args)}`;
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
    nullsFirst: connection.nullsFirst,
    find: (model, args) =>
      cached(
        model,
        'find',
        args,
        () => connection.find(model, args),
        args.where,
      ),
    count: (model, where) =>
      cached(
        model,
        'count',
        where ?? null,
        () => connection.count(model, where),
        where,
      ),
    findOne: (model, key) =>
      cached(model, 'findOne', key, () => connection.findOne(model, key)),
    insert: (model, input) =>
      written(model, () => connection.insert(model, input)),
    update: (model, key, input) =>
      written(model, () => connection.update(model, key, input)),
    delete: (model, key) => written(model, () => connection.delete(model, key)),
    upsert: (model, input) =>
      written(model, () => connection.upsert(model, input)),
    insertMany: (model, inputs) =>
      written(model, () => connection.insertMany(model, inputs)),
    deleteMany: (model, where) =>
      written(model, () => connection.deleteMany(model, where)),
    ...(begin && {
      transaction: (work) =>
        inTransaction(begin, store, settings, versionKey, work),
    }),
    async close() {
      await Promise.all([connection.close(), store.close()]);
    },
  };
}

/**
 * Runs `work` in a transaction of `connection`. Reads inside it skip the
 * cache, which may not see its writes, and the tables it wrote to are only
 * bumped once it is over, so no reader caches what was there before commit.
 */
async function inTransaction<T>(
  begin: NonNullable<DatabaseConnection['transaction']>,
  store: CacheStore,
  settings: CacheSettings,
  versionKey: (model: ModelDefinition) => string,
  work: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  const written = new Set<ModelDefinition>();
  try {
    return await begin((transaction) => {
      const inner = transaction.connection;
      const cacheless: DatabaseConnection = {
        ...inner,
        insert: (model, input) => {
          written.add(model);
          return inner.insert(model, input);
        },
        update: (model, key, input) => {
          written.add(model);
          return inner.update(model, key, input);
        },
        delete: (model, key) => {
          written.add(model);
          return inner.delete(model, key);
        },
        upsert: (model, input) => {
          written.add(model);
          return inner.upsert(model, input);
        },
        insertMany: (model, inputs) => {
          written.add(model);
          return inner.insertMany(model, inputs);
        },
        deleteMany: (model, where) => {
          written.add(model);
          return inner.deleteMany(model, where);
        },
      };
      // A nested transaction joins this one, so its writes are tracked here too.
      cacheless.transaction = (nested) =>
        nested({ ...transaction, connection: cacheless });
      return work({ ...transaction, connection: cacheless });
    });
  } finally {
    // Also after a rollback: harmless then, and needed where nothing rolled back.
    await Promise.all(
      [...written].map((model) =>
        store
          .increment(versionKey(model))
          .catch((error) => settings.onError(error)),
      ),
    );
  }
}
