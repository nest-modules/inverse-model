import { logger, serve } from '../__tests__/support/memory-api';
import type {
  DatabaseConnection,
  DatabaseRecord,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import { findAdapter } from '../adapters/find-adapter';
import { withCache } from '../cache/cached-connection';
import { createRedisStore } from '../cache/redis-store';
import type { InverseScope } from '../inverse-model.interfaces';

// The same databases as adapters.spec.ts; one without a URL is skipped.
const DATABASES = [
  ['postgres', process.env.POSTGRES_URL],
  ['mysql', process.env.MYSQL_URL],
  ['mariadb', process.env.MARIADB_URL],
  ['sqlserver', process.env.SQLSERVER_URL],
  ['mongodb', process.env.MONGODB_URL],
] as const;

const unique = (name: string) =>
  `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Each request sees only the authors whose name contains its `name`. */
const scope: InverseScope = ({ model, context }) =>
  model.endsWith('authors')
    ? { fullName: { contains: context.name as string } }
    : null;

describe.each(DATABASES)('security over %s', (name, url) => {
  const run = url ? it : it.skip;
  let connection: DatabaseConnection;
  let api: Awaited<ReturnType<typeof serve>>;
  const tag = unique(name);
  const as = (who: string) => ({ name: `${who} ${tag}` });
  const records: Record<string, DatabaseRecord> = {};

  beforeAll(async () => {
    if (!url) return;
    connection = await findAdapter(url).connect(url);
    const modelNamed = (modelName: string) =>
      connection.models.find(
        (model) => model.name === modelName,
      ) as ModelDefinition;
    for (const who of ['ann', 'bob']) {
      records[who] = await connection.insert(modelNamed('Authors'), {
        fullName: `${who} ${tag}`,
        email: `${who}-${tag}@example.com`,
      });
      records[`${who}Post`] = await connection.insert(modelNamed('BlogPosts'), {
        authorId: records[who].id,
        title: `${who}'s ${tag}`,
      });
    }
    api = await serve(connection, {
      url,
      exclude: ['authors.email', '*.metadata'],
      scope,
    });
  });

  afterAll(async () => {
    if (!url) return;
    await api.stop();
    const posts = connection.models.find((model) => model.name === 'BlogPosts');
    const authors = connection.models.find((model) => model.name === 'Authors');
    for (const who of ['ann', 'bob']) {
      await connection.delete(posts as ModelDefinition, {
        id: records[`${who}Post`].id,
      });
      await connection.delete(authors as ModelDefinition, {
        id: records[who].id,
      });
    }
    await connection.close();
  });

  run('leaves out excluded fields', () => {
    const fields = (modelName: string) =>
      api.models
        .find((model) => model.name === modelName)
        ?.fields.map((field) => field.name);
    expect(fields('Authors')).not.toContain('email');
    expect(fields('Authors')).toContain('full_name');
    expect(fields('BlogPosts')).not.toContain('metadata');
  });

  run('scopes lists, counts, lookups by key and relations', async () => {
    const id = (record: DatabaseRecord) => JSON.stringify(record.id);
    const response = await api.run(
      `{
        authors(where: { fullName: { contains: "${tag}" } }) { fullName }
        authorsCount(where: { fullName: { contains: "${tag}" } })
        bob: authorsByPk(id: ${id(records.bob)}) { id }
        blogPosts(where: { title: { contains: "${tag}" } }, orderBy: [{ title: ASC }]) {
          title
          author { fullName }
        }
      }`,
      as('ann'),
    );
    expect(response.errors).toBeUndefined();
    expect(response.data).toEqual({
      authors: [{ fullName: `ann ${tag}` }],
      authorsCount: 1,
      bob: null,
      blogPosts: [
        { title: `ann's ${tag}`, author: { fullName: `ann ${tag}` } },
        { title: `bob's ${tag}`, author: null },
      ],
    });
  });

  run('only updates and deletes rows within the scope', async () => {
    const bob = JSON.stringify(records.bob.id);
    const response = await api.run(
      `mutation {
        updateAuthors(id: ${bob}, input: { fullName: "taken" }) { id }
        deleteAuthors(id: ${bob}) { id }
      }`,
      as('ann'),
    );
    expect(response).toEqual({
      data: { updateAuthors: null, deleteAuthors: null },
    });
    const authors = connection.models.find(
      (model) => model.name === 'Authors',
    ) as ModelDefinition;
    await expect(
      connection.findOne(authors, { id: records.bob.id }),
    ).resolves.toMatchObject({ fullName: `bob ${tag}` });
  });

  // MongoDB has no NOT NULL columns to violate.
  (url && name !== 'mongodb' ? it : it.skip)(
    'masks the error of the database and logs it without the password',
    async () => {
      logger.error.mockClear();
      // email is required but excluded, so the insert fails in the database.
      const response = await api.run(
        `mutation { createAuthors(input: { fullName: "${tag}" }) { id } }`,
        as('ann'),
      );
      expect(response.errors).toEqual([
        expect.objectContaining({
          message: 'Internal server error',
          extensions: {
            code: 'INTERNAL_SERVER_ERROR',
            errorId: expect.any(String),
          },
        }),
      ]);
      expect(logger.error).toHaveBeenCalledTimes(1);
      const password = new URL(url as string).password;
      expect(logger.error.mock.calls[0].join('\n')).not.toContain(
        `:${password}@`,
      );
    },
  );
});

describe('scoped Redis cache over postgres', () => {
  const postgresUrl = process.env.POSTGRES_URL;
  const redisUrl = process.env.REDIS_URL;
  const run = postgresUrl && redisUrl ? it : it.skip;

  run('keeps the results of each scope apart', async () => {
    const database = await findAdapter(postgresUrl as string).connect(
      postgresUrl as string,
    );
    const cached = withCache(database, createRedisStore(redisUrl as string), {
      ttl: 60,
      ttlByTable: {},
      keyPrefix: `${unique('test')}:`,
      onError: (error) => {
        throw error;
      },
    });
    const authors = database.models.find(
      (model) => model.name === 'Authors',
    ) as ModelDefinition;
    const tag = unique('cache');
    const created = await Promise.all(
      ['ann', 'bob'].map((who) =>
        database.insert(authors, {
          fullName: `${who} ${tag}`,
          email: `${who}-${tag}@example.com`,
        }),
      ),
    );
    const api = await serve(cached, { url: postgresUrl, scope });
    try {
      const names = async (who: string) =>
        (
          await api.run(
            `{ authors(where: { fullName: { contains: "${tag}" } }) { fullName } }`,
            { name: `${who} ${tag}` },
          )
        ).data?.authors;
      for (let round = 0; round < 2; round++) {
        await expect(names('ann')).resolves.toEqual([
          { fullName: `ann ${tag}` },
        ]);
        await expect(names('bob')).resolves.toEqual([
          { fullName: `bob ${tag}` },
        ]);
      }
    } finally {
      await api.stop();
      for (const author of created) {
        await database.delete(authors, { id: author.id });
      }
      await cached.close();
    }
  });
});
