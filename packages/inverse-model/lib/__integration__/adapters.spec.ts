import { graphql } from 'graphql';
import { executableSchema } from '../__tests__/executable-schema';
import type {
  ConnectOptions,
  DatabaseConnection,
  DatabaseRecord,
  FieldDefinition,
  ModelDefinition,
  Where,
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

// The view of the blog sample has no key of its own; MongoDB ignores this.
const CONNECT_OPTIONS: ConnectOptions = {
  views: {
    published_posts: {
      primaryKey: ['id'],
      foreignKeys: [
        { columns: ['author_id'], table: 'authors', references: ['id'] },
      ],
    },
  },
};

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
    connection = await findAdapter(url).connect(url, CONNECT_OPTIONS);
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
    expect(connection.models.map((model) => model.name).sort()).toEqual(
      name === 'mongodb'
        ? ['Author', 'BlogPost']
        : ['Author', 'BlogPost', 'PublishedPost'],
    );
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
      fields: ['authorId'],
      references: ['id'],
    });
    expect(authors.relations).toContainEqual({
      property: 'blogPosts',
      kind: 'many',
      target: 'BlogPost',
      fields: ['id'],
      references: ['authorId'],
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

  /** An author with posts of these ratings, published when rated; removed by `cleanUp`. */
  async function authorWithPosts(ratings: (number | null)[]) {
    const tag = unique(name);
    const author = await connection.insert(authors, {
      fullName: `Writer ${tag}`,
      email: `${tag}@example.com`,
    });
    const written: DatabaseRecord[] = [];
    for (const [i, rating] of ratings.entries()) {
      written.push(
        await connection.insert(posts, {
          authorId: author.id,
          title: `Post ${i} ${tag}`,
          published: rating !== null,
          rating,
        }),
      );
    }
    const cleanUp = async () => {
      await connection.deleteMany(posts, { authorId: { eq: author.id } });
      await connection.delete(authors, { id: author.id });
    };
    return { tag, author, posts: written, cleanUp };
  }

  run('filters by relation both ways', async () => {
    const { tag, author, cleanUp } = await authorWithPosts([4, null]);
    const titles = async (where: Where) =>
      (await connection.find(posts, { where, orderBy: [{ id: 'ASC' }] })).map(
        (post) => post.title,
      );
    const ids = async (where: Where) =>
      (await connection.find(authors, { where })).map((found) =>
        String(found.id),
      );
    const mine = { email: { eq: author.email } };

    await expect(
      titles({ author: { fullName: { contains: tag.toUpperCase() } } }),
    ).resolves.toEqual([`Post 0 ${tag}`, `Post 1 ${tag}`]);
    await expect(
      ids({ ...mine, blogPosts: { some: { published: { eq: true } } } }),
    ).resolves.toEqual([String(author.id)]);
    await expect(
      ids({ ...mine, blogPosts: { none: { published: { eq: true } } } }),
    ).resolves.toEqual([]);
    await expect(
      ids({ ...mine, blogPosts: { every: { published: { eq: true } } } }),
    ).resolves.toEqual([]);
    await expect(
      ids({ ...mine, blogPosts: { every: { title: { contains: tag } } } }),
    ).resolves.toEqual([String(author.id)]);
    await expect(
      connection.count(authors, {
        ...mine,
        blogPosts: { some: { author: { email: { eq: author.email } } } },
      }),
    ).resolves.toBe(1);
    await cleanUp();
  });

  run('upserts by key and writes in batches', async () => {
    const tag = unique(name);
    const created = await connection.upsert(authors, {
      fullName: 'New',
      email: `${tag}@example.com`,
    });
    const updated = await connection.upsert(authors, {
      id: created.id,
      fullName: 'Renamed',
      email: created.email,
    });
    expect(updated).toMatchObject({ id: created.id, fullName: 'Renamed' });

    const many = ['a', 'b', 'c'].map((letter) => ({
      authorId: created.id,
      title: `${letter} ${tag}`,
      published: false,
    }));
    await expect(connection.insertMany(posts, many)).resolves.toBe(3);
    const mine = { authorId: { eq: created.id } };
    await expect(connection.count(posts, mine)).resolves.toBe(3);
    await expect(
      connection.deleteMany(posts, {
        ...mine,
        author: { fullName: { eq: 'Renamed' } },
        title: { ne: `a ${tag}` },
      }),
    ).resolves.toBe(2);
    await expect(connection.deleteMany(posts, mine)).resolves.toBe(1);
    await connection.delete(authors, { id: created.id });
  });

  run('pages a connection by cursor, nulls included', async () => {
    const { author, cleanUp } = await authorWithPosts([3, null, 1, null, 3]);
    const schema = executableSchema(connection, {
      defaultLimit: 2,
      maxLimit: 10,
    });
    const page = async (args: string) => {
      const result = await graphql({
        schema,
        source: `{ blogPostsConnection(where: { authorId: { eq: ${JSON.stringify(author.id)} } }, ${args}) {
          edges { node { id } } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } totalCount
        } }`,
        contextValue: {},
      });
      expect(result.errors).toBeUndefined();
      return (result.data as Record<string, unknown>).blogPostsConnection as {
        edges: { node: { id: unknown } }[];
        pageInfo: {
          hasNextPage: boolean;
          hasPreviousPage: boolean;
          startCursor: string;
          endCursor: string;
        };
        totalCount: number;
      };
    };

    for (const direction of ['ASC', 'DESC']) {
      const orderBy = `orderBy: [{ rating: ${direction} }]`;
      const everything = await page(`${orderBy}, first: 10`);
      const expected = everything.edges.map((edge) => String(edge.node.id));
      expect(expected).toHaveLength(5);
      expect(everything.totalCount).toBe(5);

      const forward: string[] = [];
      let after = '';
      for (;;) {
        const found = await page(`${orderBy}, first: 2${after}`);
        forward.push(...found.edges.map((edge) => String(edge.node.id)));
        if (!found.pageInfo.hasNextPage) break;
        after = `, after: "${found.pageInfo.endCursor}"`;
      }
      expect(forward).toEqual(expected);

      const backward: string[] = [];
      let before = '';
      for (;;) {
        const found = await page(`${orderBy}, last: 2${before}`);
        backward.unshift(...found.edges.map((edge) => String(edge.node.id)));
        if (!found.pageInfo.hasPreviousPage) break;
        before = `, before: "${found.pageInfo.startCursor}"`;
      }
      expect(backward).toEqual(expected);
    }
    await cleanUp();
  });
});

const SQL_TYPES = {
  postgres: 'postgres',
  mysql: 'mysql',
  mariadb: 'mariadb',
  sqlserver: 'mssql',
} as const;

describe.each(DATABASES.filter(([name]) => name !== 'mongodb'))(
  '%s views and composite keys',
  (name, url) => {
    const run = url ? it : it.skip;

    run('exposes the view read-only, with the declared keys', async () => {
      const connection = await findAdapter(url as string).connect(
        url as string,
        CONNECT_OPTIONS,
      );
      try {
        const model = (modelName: string) =>
          connection.models.find(
            (candidate) => candidate.name === modelName,
          ) as ModelDefinition;
        const view = model('PublishedPost');
        expect(view).toMatchObject({ readOnly: true, primaryKey: ['id'] });
        expect(view.relations).toContainEqual({
          property: 'author',
          kind: 'one',
          target: 'Author',
          fields: ['authorId'],
          references: ['id'],
        });

        const tag = unique(name);
        const author = await connection.insert(model('Author'), {
          fullName: `Viewed ${tag}`,
          email: `${tag}@example.com`,
        });
        const post = await connection.insert(model('BlogPost'), {
          authorId: author.id,
          title: `Shown ${tag}`,
          published: true,
        });
        await connection.insert(model('BlogPost'), {
          authorId: author.id,
          title: `Hidden ${tag}`,
          published: false,
        });

        const schema = executableSchema(connection);
        const result = await graphql({
          schema,
          source: `{
            publishedPosts(where: { author: { email: { eq: "${tag}@example.com" } } }) { title authorName author { email } }
            publishedPostsCount(where: { authorName: { contains: "${tag}" } })
            publishedPost(id: ${JSON.stringify(post.id)}) { title }
            authors(where: { email: { eq: "${tag}@example.com" } }) { publishedPosts { title } }
          }`,
          contextValue: {},
        });
        expect(result.errors).toBeUndefined();
        expect(result.data).toEqual({
          publishedPosts: [
            {
              title: `Shown ${tag}`,
              authorName: `Viewed ${tag}`,
              author: { email: `${tag}@example.com` },
            },
          ],
          publishedPostsCount: 1,
          publishedPost: { title: `Shown ${tag}` },
          authors: [{ publishedPosts: [{ title: `Shown ${tag}` }] }],
        });

        await connection.deleteMany(model('BlogPost'), {
          authorId: { eq: author.id },
        });
        await connection.delete(model('Author'), { id: author.id });
      } finally {
        await connection.close();
      }
    });

    run('follows composite foreign keys', async () => {
      const { DataSource } = await import('typeorm');
      const admin = await new DataSource({
        type: SQL_TYPES[name as keyof typeof SQL_TYPES],
        url,
        ...(name === 'sqlserver'
          ? { options: { trustServerCertificate: true } }
          : {}),
      } as ConstructorParameters<typeof DataSource>[0]).initialize();
      const drop = async () => {
        for (const table of ['im_reviews', 'im_editions']) {
          await admin.query(
            name === 'sqlserver'
              ? `IF OBJECT_ID('${table}') IS NOT NULL DROP TABLE ${table}`
              : `DROP TABLE IF EXISTS ${table}`,
          );
        }
      };
      await drop();
      await admin.query(`CREATE TABLE im_editions (
        book_id int NOT NULL, edition int NOT NULL, label varchar(50) NOT NULL,
        PRIMARY KEY (book_id, edition))`);
      await admin.query(`CREATE TABLE im_reviews (
        id int NOT NULL PRIMARY KEY, book_id int NOT NULL, edition int NOT NULL, stars int NOT NULL,
        FOREIGN KEY (book_id, edition) REFERENCES im_editions (book_id, edition))`);
      await admin.query(
        `INSERT INTO im_editions (book_id, edition, label) VALUES (1, 1, 'First'), (1, 2, 'Second')`,
      );
      await admin.query(
        `INSERT INTO im_reviews (id, book_id, edition, stars) VALUES (1, 1, 2, 5), (2, 1, 2, 2), (3, 1, 1, 4)`,
      );

      const connection = await findAdapter(url as string).connect(
        url as string,
      );
      try {
        const reviews = connection.models.find(
          (model) => model.name === 'ImReview',
        ) as ModelDefinition;
        expect(reviews.relations).toEqual([
          {
            property: 'imEdition',
            kind: 'one',
            target: 'ImEdition',
            fields: ['bookId', 'edition'],
            references: ['bookId', 'edition'],
          },
        ]);
        const result = await graphql({
          schema: executableSchema(connection, {
            defaultLimit: 10,
            maxLimit: 10,
          }),
          source: `{
            imReviews(orderBy: [{ id: ASC }]) { stars imEdition { label } }
            imEditions(orderBy: [{ edition: ASC }], where: { imReviews: { some: { stars: { gte: 5 } } } }) {
              label imReviews(orderBy: [{ id: ASC }]) { id }
            }
          }`,
          contextValue: {},
        });
        expect(result.errors).toBeUndefined();
        expect(result.data).toEqual({
          imReviews: [
            { stars: 5, imEdition: { label: 'Second' } },
            { stars: 2, imEdition: { label: 'Second' } },
            { stars: 4, imEdition: { label: 'First' } },
          ],
          imEditions: [{ label: 'Second', imReviews: [{ id: 1 }, { id: 2 }] }],
        });
      } finally {
        await connection.close();
        await drop();
        await admin.destroy();
      }
    });
  },
);

describe('mongodb references', () => {
  const url = process.env.MONGODB_URL;
  const run = url ? it : it.skip;

  run(
    'follows DBRefs and arrays of ids, and filters through them',
    async () => {
      const { MongoClient, DBRef, ObjectId } = await import('mongodb');
      const client = await new MongoClient(url as string).connect();
      const db = client.db();
      const [ada, alan] = [new ObjectId(), new ObjectId()];
      const [red, blue] = [new ObjectId(), new ObjectId()];
      await db.collection('im_writers').insertMany([
        { _id: ada, name: 'Ada' },
        { _id: alan, name: 'Alan' },
      ]);
      await db.collection('im_colors').insertMany([
        { _id: red, label: 'red' },
        { _id: blue, label: 'blue' },
      ]);
      await db.collection('im_notes').insertMany([
        {
          title: 'first',
          writer: new DBRef('im_writers', ada),
          im_color_ids: [red, blue],
        },
        {
          title: 'second',
          writer: new DBRef('im_writers', alan),
          im_color_ids: [blue],
        },
      ]);

      const connection = await findAdapter(url as string).connect(
        url as string,
      );
      try {
        const notes = connection.models.find(
          (model) => model.name === 'ImNote',
        ) as ModelDefinition;
        expect(notes.relations).toEqual([
          {
            property: 'imWriter',
            kind: 'one',
            target: 'ImWriter',
            fields: ['writer'],
            references: ['id'],
          },
          {
            property: 'imColors',
            kind: 'many',
            target: 'ImColor',
            fields: ['imColorIds'],
            references: ['id'],
          },
        ]);

        const schema = executableSchema(connection, {
          defaultLimit: 10,
          maxLimit: 10,
        });
        const query = async (source: string) => {
          const result = await graphql({ schema, source, contextValue: {} });
          expect(result.errors).toBeUndefined();
          return result.data;
        };
        await expect(
          query(`{
          imNotes(orderBy: [{ title: ASC }]) { title writer imWriter { name } imColors(orderBy: [{ label: ASC }]) { label } }
          imColors(orderBy: [{ label: ASC }]) { label imNotes { title } }
        }`),
        ).resolves.toEqual({
          imNotes: [
            {
              title: 'first',
              writer: ada.toHexString(),
              imWriter: { name: 'Ada' },
              imColors: [{ label: 'blue' }, { label: 'red' }],
            },
            {
              title: 'second',
              writer: alan.toHexString(),
              imWriter: { name: 'Alan' },
              imColors: [{ label: 'blue' }],
            },
          ],
          imColors: [
            {
              label: 'blue',
              imNotes: [{ title: 'first' }, { title: 'second' }],
            },
            { label: 'red', imNotes: [{ title: 'first' }] },
          ],
        });
        await expect(
          query(`{
          byWriter: imNotes(where: { imWriter: { name: { eq: "Alan" } } }) { title }
          byColor: imNotes(where: { imColors: { none: { label: { eq: "red" } } } }) { title }
          writers: imWritersCount(where: { imNotes: { some: { imColors: { some: { label: { eq: "red" } } } } } })
        }`),
        ).resolves.toEqual({
          byWriter: [{ title: 'second' }],
          byColor: [{ title: 'second' }],
          writers: 1,
        });

        // A written reference keeps its form: a DBRef stays a DBRef.
        const created = await connection.insert(notes, {
          title: 'third',
          writer: ada.toHexString(),
          imColorIds: [red.toHexString()],
        });
        const stored = await db
          .collection('im_notes')
          .findOne({ _id: new ObjectId(created.id as string) });
        expect(stored?.writer).toBeInstanceOf(DBRef);
        expect(stored?.im_color_ids[0]).toBeInstanceOf(ObjectId);
      } finally {
        await connection.close();
        for (const name of ['im_writers', 'im_colors', 'im_notes']) {
          await db.collection(name).drop();
        }
        await client.close();
      }
    },
  );
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
