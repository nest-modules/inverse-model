import type { CacheStore } from '../cache/cache-store.interface';
import { withCache } from '../cache/cached-connection';
import { blogModels, memoryDatabase } from './support/memory-database';

function memoryStore() {
  const entries = new Map<string, string>();
  const store: CacheStore = {
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
  return { store, entries };
}

describe('withCache in a transaction', () => {
  const setup = () => {
    const database = memoryDatabase(blogModels());
    const { store, entries } = memoryStore();
    const cached = withCache(database.connection, store, {
      ttl: 60,
      ttlByTable: {},
      keyPrefix: 't:',
      onError: jest.fn(),
    });
    const [authors] = cached.models;
    return { database, entries, cached, authors };
  };

  it('bumps the tables written only once the transaction is over', async () => {
    const { entries, cached, authors } = setup();
    let versionInside: string | undefined;

    await cached.transaction?.(async ({ connection }) => {
      await connection.insert(authors, { fullName: 'Ada' });
      versionInside = entries.get('t:authors:version');
    });

    expect(versionInside).toBeUndefined();
    expect(entries.get('t:authors:version')).toBe('1');
    expect(entries.get('t:blog_posts:version')).toBeUndefined();
  });

  it('reads inside a transaction from the database, not the cache', async () => {
    const { database, cached, authors } = setup();
    await cached.find(authors, {});

    const seen = await cached.transaction?.(async ({ connection }) => {
      await connection.insert(authors, { fullName: 'Ada' });
      return connection.find(authors, {});
    });

    expect(seen).toEqual([{ id: 1, fullName: 'Ada' }]);
    expect(database.log.filter((entry) => entry === 'find authors')).toEqual([
      'find authors',
      'find authors',
    ]);
  });

  it('still bumps the tables after a rollback, and a nested transaction joins', async () => {
    const { entries, cached, authors } = setup();

    await expect(
      cached.transaction?.(
        ({ connection }) =>
          connection.transaction?.(async (nested) => {
            await nested.connection.insert(authors, { fullName: 'Ada' });
            throw new Error('rolled back');
          }) as Promise<void>,
      ),
    ).rejects.toThrow('rolled back');
    expect(entries.get('t:authors:version')).toBe('1');
  });
});
