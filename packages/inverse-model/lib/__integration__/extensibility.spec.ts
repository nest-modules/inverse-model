import type {
  DatabaseConnection,
  DatabaseRecord,
  DatabaseTransaction,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import { findAdapter } from '../adapters/find-adapter';
import { withCache } from '../cache/cached-connection';
import { createRedisStore } from '../cache/redis-store';
import { createWrites } from '../hooks/writes';
import { withRenames } from '../rename/with-renames';

// The databases of compose.yaml with the blog sample; MongoDB runs as a replica set there.
const DATABASES = [
  ['postgres', process.env.POSTGRES_URL],
  ['mysql', process.env.MYSQL_URL],
  ['mariadb', process.env.MARIADB_URL],
  ['sqlserver', process.env.SQLSERVER_URL],
  ['mongodb', process.env.MONGODB_URL],
] as const;

const unique = (name: string) =>
  `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Whether the driver's own handle says the transaction is open. */
function nativeTransactionOpen(transaction: DatabaseTransaction) {
  if (transaction.manager) {
    return transaction.manager.queryRunner?.isTransactionActive === true;
  }
  const session = transaction.session as { inTransaction(): boolean };
  return session.inTransaction();
}

describe.each(DATABASES)('hooks on %s', (name, url) => {
  const run = url ? it : it.skip;
  let connection: DatabaseConnection;
  let authors: ModelDefinition;
  let posts: ModelDefinition;

  beforeAll(async () => {
    if (!url) return;
    connection = await findAdapter(url).connect(url);
    const modelNamed = (modelName: string) =>
      connection.models.find(
        (model) => model.name === modelName,
      ) as ModelDefinition;
    authors = modelNamed('Authors');
    posts = modelNamed('BlogPosts');
  });

  afterAll(() => connection?.close());

  const byEmail = (email: string) =>
    connection.find(authors, { where: { email: { eq: email } } });

  run('commits a write with what its hooks wrote and changed', async () => {
    const email = `${unique(name)}@example.com`;
    let open = false;
    const writes = createWrites(connection, {
      authors: {
        beforeCreate: ({ input }) => ({ ...input, fullName: 'Changed' }),
        afterCreate: async ({ record, transaction }) => {
          open = transaction.active && nativeTransactionOpen(transaction);
          await transaction.connection.insert(posts, {
            authorId: record?.id,
            title: 'Written by a hook',
            published: false,
          });
        },
      },
    });

    const author = await writes.create(authors, { fullName: 'Ada', email });

    expect(open).toBe(true);
    expect(author.fullName).toBe('Changed');
    const [post] = await connection.find(posts, {
      where: { authorId: { eq: author.id } },
    });
    expect(post?.title).toBe('Written by a hook');
    await connection.delete(posts, { id: post.id });
    await connection.delete(authors, { id: author.id });
  });

  run(
    'rolls the write and the writes of its hooks back when an after-hook throws',
    async () => {
      const email = `${unique(name)}@example.com`;
      let authorId: unknown;
      const writes = createWrites(connection, {
        '*': {
          afterCreate: async ({ model, record, transaction }) => {
            if (model !== authors) return;
            authorId = record?.id;
            await transaction.connection.insert(posts, {
              authorId,
              title: 'Rolled back',
              published: false,
            });
            throw new Error('Rejected after the write');
          },
        },
      });

      await expect(
        writes.create(authors, { fullName: 'Ada', email }),
      ).rejects.toThrow('Rejected after the write');

      await expect(byEmail(email)).resolves.toEqual([]);
      await expect(
        connection.count(posts, { authorId: { eq: authorId } }),
      ).resolves.toBe(0);
    },
  );

  run('keeps an update and a delete when a before-hook throws', async () => {
    const author = await connection.insert(authors, {
      fullName: 'Ada',
      email: `${unique(name)}@example.com`,
    });
    const key = { id: author.id };
    const writes = createWrites(connection, {
      authors: {
        beforeUpdate: ({ record }) => {
          if (record?.fullName === 'Ada') throw new Error('Ada stays Ada');
        },
        afterDelete: () => {
          throw new Error('Not deleted');
        },
      },
    });

    await expect(
      writes.update(authors, key, { fullName: 'Grace' }),
    ).rejects.toThrow('Ada stays Ada');
    await expect(writes.delete(authors, key)).rejects.toThrow('Not deleted');
    await expect(connection.findOne(authors, key)).resolves.toMatchObject({
      fullName: 'Ada',
    });
    await connection.delete(authors, key);
  });

  run('reads and writes renamed tables and fields', async () => {
    const renamed = withRenames(connection, {
      tables: { blog_posts: 'Article' },
      fields: {
        'authors.full_name': 'name',
        'blog_posts.author_id': 'writerId',
      },
    });
    const writer = renamed.models.find(
      (model) => model.source === 'authors',
    ) as ModelDefinition;
    const article = renamed.models.find(
      (model) => model.name === 'Article',
    ) as ModelDefinition;
    const email = `${unique(name)}@example.com`;

    const author = await renamed.insert(writer, { name: 'Ada', email });
    expect(author).toMatchObject({ name: 'Ada', email });
    const post = await renamed.insert(article, {
      writerId: author.id,
      title: 'Renamed',
      published: true,
    });
    const found: DatabaseRecord[] = await renamed.find(article, {
      where: { writerId: { eq: author.id } },
      orderBy: [{ writerId: 'ASC' }],
    });
    expect(found).toMatchObject([{ title: 'Renamed' }]);
    expect(String(found[0].writerId)).toBe(String(author.id));

    await renamed.delete(article, { id: post.id });
    await renamed.delete(writer, { id: author.id });
  });
});

describe('hooks with the Redis cache over postgres', () => {
  const postgresUrl = process.env.POSTGRES_URL;
  const redisUrl = process.env.REDIS_URL;
  const run = postgresUrl && redisUrl ? it : it.skip;
  let cached: DatabaseConnection;
  let authors: ModelDefinition;

  beforeAll(async () => {
    if (!postgresUrl || !redisUrl) return;
    const database = await findAdapter(postgresUrl).connect(postgresUrl);
    cached = withCache(database, createRedisStore(redisUrl), {
      ttl: 60,
      ttlByTable: {},
      keyPrefix: `${unique('test')}:`,
      onError: (error) => {
        throw error;
      },
    });
    authors = database.models.find(
      (model) => model.name === 'Authors',
    ) as ModelDefinition;
  });

  afterAll(() => cached?.close());

  run(
    'clears the cached results of a table once the write commits',
    async () => {
      const email = `${unique('cached')}@example.com`;
      const mine = { email: { eq: email } };
      await expect(cached.count(authors, mine)).resolves.toBe(0);
      let countInside: number | undefined;
      const writes = createWrites(cached, {
        authors: {
          afterCreate: async ({ transaction }) => {
            // Inside the transaction the new row shows, read from the database.
            countInside = await transaction.connection.count(authors, mine);
          },
        },
      });

      const author = await writes.create(authors, {
        fullName: 'Cached',
        email,
      });

      expect(countInside).toBe(1);
      await expect(cached.count(authors, mine)).resolves.toBe(1);
      await writes.delete(authors, { id: author.id });
      await expect(cached.count(authors, mine)).resolves.toBe(0);
    },
  );
});
