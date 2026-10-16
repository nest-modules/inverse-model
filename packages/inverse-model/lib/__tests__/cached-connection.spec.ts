import type {
  DatabaseConnection,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import type { CacheStore } from '../cache/cache-store.interface';
import { withCache } from '../cache/cached-connection';

function memoryStore(): CacheStore & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    get: async (key) => entries.get(key) ?? null,
    set: async (key, value) => {
      entries.set(key, value);
    },
    increment: async (key) => {
      const next = Number(entries.get(key) ?? 0) + 1;
      entries.set(key, String(next));
      return next;
    },
    close: async () => {},
  };
}

const model = (source: string): ModelDefinition => ({
  name: source,
  source,
  fields: [],
  primaryKey: ['id'],
  relations: [],
});

describe('withCache', () => {
  const authors = model('authors');
  const posts = model('posts');
  let rows: Record<string, unknown>[];
  let connection: DatabaseConnection;
  let store: ReturnType<typeof memoryStore>;
  let cached: DatabaseConnection;

  beforeEach(() => {
    rows = [{ id: 1 }];
    connection = {
      models: [authors, posts],
      find: jest.fn(async () => [...rows]),
      count: jest.fn(async () => rows.length),
      findOne: jest.fn(async () => rows[0]),
      insert: jest.fn(async (_model, input) => {
        rows.push(input);
        return input;
      }),
      update: jest.fn(async () => null),
      delete: jest.fn(async () => null),
      upsert: jest.fn(async (_model, input) => input),
      insertMany: jest.fn(async (_model, inputs) => {
        rows.push(...inputs);
        return inputs.length;
      }),
      deleteMany: jest.fn(async () => 0),
      nullsFirst: true,
      close: jest.fn(async () => {}),
    };
    store = memoryStore();
    cached = withCache(connection, store, {
      ttl: 60,
      ttlByTable: { posts: 0 },
      keyPrefix: 'test:',
      onError: jest.fn(),
    });
  });

  it('answers a repeated read from the cache', async () => {
    await cached.find(authors, { limit: 10 });
    rows.push({ id: 2 });
    await expect(cached.find(authors, { limit: 10 })).resolves.toEqual([
      { id: 1 },
    ]);
    expect(connection.find).toHaveBeenCalledTimes(1);
  });

  it('keys reads by their arguments', async () => {
    await cached.find(authors, { limit: 10 });
    await cached.find(authors, { limit: 20 });
    expect(connection.find).toHaveBeenCalledTimes(2);
  });

  it('reads the database again after a write to the same table', async () => {
    await cached.count(authors);
    await cached.insert(authors, { id: 2 });
    await expect(cached.count(authors)).resolves.toBe(2);
  });

  it('keeps other tables cached after a write', async () => {
    await cached.findOne(authors, { id: 1 });
    await cached.insert(posts, { id: 9 });
    await cached.findOne(authors, { id: 1 });
    expect(connection.findOne).toHaveBeenCalledTimes(1);
  });

  it('reads the database again after a batch write or an upsert', async () => {
    await cached.count(authors);
    await cached.insertMany(authors, [{ id: 2 }, { id: 3 }]);
    await expect(cached.count(authors)).resolves.toBe(3);
    await cached.upsert(authors, { id: 3 });
    await cached.count(authors);
    await cached.deleteMany(authors, { id: { eq: 3 } });
    await cached.count(authors);
    expect(connection.count).toHaveBeenCalledTimes(4);
  });

  it('keys a relation filter on the related table too', async () => {
    const withPosts: ModelDefinition = {
      ...model('writers'),
      relations: [
        {
          property: 'posts',
          kind: 'many',
          target: 'authors',
          fields: ['id'],
          references: ['writerId'],
        },
      ],
    };
    connection.models.push(withPosts);
    const where = { posts: { some: { id: { eq: 1 } } } };
    await cached.count(withPosts, where);
    await cached.count(withPosts, where);
    expect(connection.count).toHaveBeenCalledTimes(1);
    await cached.insert(authors, { id: 2 });
    await cached.count(withPosts, where);
    expect(connection.count).toHaveBeenCalledTimes(2);
  });

  it('skips tables with a TTL of 0', async () => {
    await cached.find(posts, {});
    await cached.find(posts, {});
    expect(connection.find).toHaveBeenCalledTimes(2);
  });

  it('falls back to the database when the store fails', async () => {
    const onError = jest.fn();
    const broken = withCache(
      connection,
      { ...store, get: async () => Promise.reject(new Error('down')) },
      { ttl: 60, ttlByTable: {}, keyPrefix: 'test:', onError },
    );
    await expect(broken.find(authors, {})).resolves.toEqual([{ id: 1 }]);
    expect(onError).toHaveBeenCalled();
  });
});
