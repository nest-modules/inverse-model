import type {
  DatabaseConnection,
  DatabaseRecord,
  FieldDefinition,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import { findAdapter } from '../adapters/find-adapter';
import { withCache } from '../cache/cached-connection';
import { createRedisStore } from '../cache/redis-store';

// Each database comes from compose.yaml with the blog sample loaded; one without a URL is skipped.
const DATABASES = [
  ['postgres', process.env.POSTGRES_URL],
  ['mysql', process.env.MYSQL_URL],
  ['mariadb', process.env.MARIADB_URL],
  ['sqlserver', process.env.SQLSERVER_URL],
  ['mongodb', process.env.MONGODB_URL],
] as const;

const unique = (name: string) =>
  `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe.each(DATABASES)('%s adapter', (name, url) => {
  const run = url ? it : it.skip;
  let connection: DatabaseConnection;
  let authors: ModelDefinition;
  let posts: ModelDefinition;
  const fieldOf = (model: ModelDefinition, property: string) =>
    model.fields.find((field) => field.property === property) as
      | FieldDefinition
      | undefined;

  beforeAll(async () => {
    if (!url) return;
    connection = await findAdapter(url).connect(url);
    const modelNamed = (modelName: string) =>
      connection.models.find(
        (model) => model.name === modelName,
      ) as ModelDefinition;
    authors = modelNamed('Author');
    posts = modelNamed('BlogPost');
  });

  afterAll(() => connection?.close());

  run('is picked for its URL', () => {
    expect(findAdapter(url as string).name).toBe(name);
  });

  run('reads the tables or collections of the blog', () => {
    expect(connection.models.map((model) => model.name).sort()).toEqual([
      'Author',
      'BlogPost',
    ]);
  });

  run('reads fields, their types and the primary key', () => {
    expect(authors.primaryKey).toEqual(['id']);
    expect(fieldOf(authors, 'id')).toMatchObject({
      hasDefault: true,
      isNullable: false,
    });
    expect(fieldOf(authors, 'fullName')).toMatchObject({
      name: 'full_name',
      type: 'String',
    });
    expect(fieldOf(authors, 'createdAt')?.type).toBe('DateTime');
    expect(fieldOf(posts, 'published')?.type).toBe('Boolean');
    expect(fieldOf(posts, 'rating')?.type).toBe('Float');
  });

  run('reads the relation between posts and authors both ways', () => {
    expect(posts.relations).toContainEqual({
      property: 'author',
      kind: 'one',
      target: 'Author',
      field: 'authorId',
      reference: 'id',
    });
    expect(authors.relations).toContainEqual({
      property: 'blogPosts',
      kind: 'many',
      target: 'BlogPost',
      field: 'id',
      reference: 'authorId',
    });
  });

  run('creates, reads, updates and deletes a record', async () => {
    const email = `${unique(name)}@example.com`;
    const created = await connection.insert(authors, {
      fullName: 'Ada',
      email,
    });
    expect(created).toMatchObject({ fullName: 'Ada', email });
    // Defaults the database filled in come back too; MongoDB has none.
    if (name !== 'mongodb') expect(created.createdAt).toBeDefined();

    const key = { id: created.id };
    await expect(connection.findOne(authors, key)).resolves.toMatchObject({
      email,
    });
    await expect(
      connection.update(authors, key, { fullName: 'Ada Lovelace' }),
    ).resolves.toMatchObject({ fullName: 'Ada Lovelace', email });
    await expect(connection.delete(authors, key)).resolves.toMatchObject({
      email,
    });
    await expect(connection.findOne(authors, key)).resolves.toBeNull();
  });

  run('filters, orders, counts and pages', async () => {
    const tag = unique(name);
    const created: DatabaseRecord[] = [];
    for (const fullName of ['ann', 'bob', 'cid']) {
      created.push(
        await connection.insert(authors, {
          fullName: `${fullName} ${tag}`,
          email: `${fullName}-${tag}@example.com`,
        }),
      );
    }
    const mine = { fullName: { contains: tag.toUpperCase() } };

    await expect(connection.count(authors, mine)).resolves.toBe(3);
    const page = await connection.find(authors, {
      where: mine,
      orderBy: [{ fullName: 'DESC' }],
      limit: 2,
      offset: 1,
    });
    expect(page.map((author) => author.fullName)).toEqual([
      `bob ${tag}`,
      `ann ${tag}`,
    ]);
    const some = await connection.find(authors, {
      where: {
        OR: [
          { id: { in: [created[0].id] } },
          { email: { eq: `cid-${tag}@example.com` } },
        ],
      },
      orderBy: [{ id: 'ASC' }],
    });
    expect(some.map((author) => author.id)).toEqual([
      created[0].id,
      created[2].id,
    ]);

    for (const author of created) {
      await connection.delete(authors, { id: author.id });
    }
  });

  run('writes and follows a foreign key', async () => {
    const author = await connection.insert(authors, {
      fullName: 'Grace',
      email: `${unique(name)}@example.com`,
    });
    const post = await connection.insert(posts, {
      authorId: author.id,
      title: 'Compilers',
      published: true,
    });
    expect(post).toMatchObject({ title: 'Compilers', published: true });

    const byAuthor = await connection.find(posts, {
      where: { authorId: { in: [author.id] } },
    });
    expect(byAuthor.map((found) => found.title)).toEqual(['Compilers']);
    expect(String(byAuthor[0].authorId)).toBe(String(author.id));

    await connection.delete(posts, { id: post.id });
    await connection.delete(authors, { id: author.id });
  });
});

describe('Redis cache over postgres', () => {
  const postgresUrl = process.env.POSTGRES_URL;
  const redisUrl = process.env.REDIS_URL;
  const run = postgresUrl && redisUrl ? it : it.skip;
  let database: DatabaseConnection;
  let cached: DatabaseConnection;
  let authors: ModelDefinition;

  beforeAll(async () => {
    if (!postgresUrl || !redisUrl) return;
    database = await findAdapter(postgresUrl).connect(postgresUrl);
    cached = withCache(database, createRedisStore(redisUrl), {
      ttl: 60,
      ttlByTable: {},
      keyPrefix: `${unique('test')}:`,
      onError: (error) => {
        throw error;
      },
    });
    authors = database.models.find(
      (model) => model.name === 'Author',
    ) as ModelDefinition;
  });

  afterAll(() => cached?.close());

  run('serves reads from Redis until a mutation on the table', async () => {
    const before = await cached.count(authors);
    // Written behind the cache's back, so the cached count stays stale.
    const ghost = await database.insert(authors, {
      fullName: 'Ghost',
      email: `${unique('ghost')}@example.com`,
    });
    await expect(cached.count(authors)).resolves.toBe(before);

    // A write through the cache clears the table's results.
    await cached.delete(authors, { id: ghost.id });
    await expect(cached.count(authors)).resolves.toBe(before);
    const author = await cached.insert(authors, {
      fullName: 'Real',
      email: `${unique('real')}@example.com`,
    });
    await expect(cached.count(authors)).resolves.toBe(before + 1);
    await cached.delete(authors, { id: author.id });
  });
});
