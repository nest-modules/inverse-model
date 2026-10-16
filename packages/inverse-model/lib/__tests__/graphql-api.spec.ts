import { graphql } from 'graphql';
import type {
  DatabaseConnection,
  DatabaseRecord,
  FieldDefinition,
  FieldFilter,
  ModelDefinition,
  Where,
} from '../adapters/database-adapter.interface';
import { addRelations } from '../adapters/relations';
import { createSchema } from '../graphql/create-schema';
import { executableSchema } from './executable-schema';

const field = (
  property: string,
  type: FieldDefinition['type'],
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({
  name: property,
  property,
  type,
  isArray: false,
  isNullable: false,
  hasDefault: false,
  ...extra,
});

function blogModels() {
  const authors: ModelDefinition = {
    name: 'Author',
    source: 'authors',
    fields: [
      field('id', 'Int', { hasDefault: true }),
      field('fullName', 'String'),
      field('createdAt', 'DateTime', { hasDefault: true }),
    ],
    primaryKey: ['id'],
    relations: [],
  };
  const posts: ModelDefinition = {
    name: 'BlogPost',
    source: 'blog_posts',
    fields: [
      field('id', 'Int', { hasDefault: true }),
      field('authorId', 'Int'),
      field('title', 'String'),
      field('metadata', 'JSON', { isNullable: true }),
    ],
    primaryKey: ['id'],
    relations: [],
  };
  const logs: ModelDefinition = {
    name: 'Log',
    source: 'logs',
    fields: [field('message', 'String')],
    primaryKey: [],
    relations: [],
  };
  addRelations([
    {
      source: posts,
      fields: ['authorId'],
      target: authors,
      references: ['id'],
    },
  ]);
  return [authors, posts, logs];
}

/** A view, a composite foreign key and a key holding an array of ids. */
function otherModels() {
  const published: ModelDefinition = {
    name: 'PublishedPost',
    source: 'published_posts',
    fields: [field('id', 'Int'), field('title', 'String')],
    primaryKey: ['id'],
    relations: [],
    readOnly: true,
  };
  const editions: ModelDefinition = {
    name: 'BookEdition',
    source: 'book_editions',
    fields: [
      field('bookId', 'Int'),
      field('edition', 'Int'),
      field('label', 'String'),
    ],
    primaryKey: ['bookId', 'edition'],
    relations: [],
  };
  const reviews: ModelDefinition = {
    name: 'Review',
    source: 'reviews',
    fields: [
      field('id', 'Int', { hasDefault: true }),
      field('bookId', 'Int'),
      field('edition', 'Int'),
      field('stars', 'Int'),
    ],
    primaryKey: ['id'],
    relations: [],
  };
  const tags: ModelDefinition = {
    name: 'Tag',
    source: 'tags',
    fields: [field('id', 'ID'), field('label', 'String')],
    primaryKey: ['id'],
    relations: [],
  };
  const notes: ModelDefinition = {
    name: 'Note',
    source: 'notes',
    fields: [
      field('id', 'ID'),
      field('tagIds', 'ID', { isArray: true, isNullable: true }),
    ],
    primaryKey: ['id'],
    relations: [],
  };
  addRelations([
    {
      source: reviews,
      fields: ['bookId', 'edition'],
      target: editions,
      references: ['bookId', 'edition'],
    },
    { source: notes, fields: ['tagIds'], target: tags, references: ['id'] },
  ]);
  return [published, editions, reviews, tags, notes];
}

const matches = (record: DatabaseRecord, where?: Where | null): boolean =>
  !where ||
  Object.entries(where).every(([key, value]) => {
    if (value === null || value === undefined) return true;
    if (key === 'AND')
      return (value as Where[]).every((w) => matches(record, w));
    if (key === 'OR') return (value as Where[]).some((w) => matches(record, w));
    if (key === 'NOT') return !matches(record, value as Where);
    const filter = value as FieldFilter;
    const actual = record[key] as number;
    return (
      (filter.eq == null || actual === filter.eq) &&
      (filter.gt == null || actual > (filter.gt as number)) &&
      (filter.lt == null || actual < (filter.lt as number)) &&
      (filter.isNull == null || (actual == null) === filter.isNull) &&
      (filter.in == null ||
        (Array.isArray(actual)
          ? actual.some((element) => filter.in?.includes(element))
          : filter.in.includes(actual))) &&
      (filter.contains == null ||
        String(actual).toLowerCase().includes(filter.contains.toLowerCase()))
    );
  });

/** Enough of a database for the API: filters on eq, gt, lt, isNull, in and contains, ordering, paging. */
function memoryConnection(models: ModelDefinition[]) {
  const tables = new Map<string, DatabaseRecord[]>(
    models.map((model) => [model.name, []]),
  );
  const nextId = new Map<string, number>();
  const rows = (model: ModelDefinition) =>
    tables.get(model.name) as DatabaseRecord[];
  const byKey = (model: ModelDefinition, key: DatabaseRecord) =>
    rows(model).find((row) =>
      model.primaryKey.every((property) => row[property] === key[property]),
    ) ?? null;

  const connection: DatabaseConnection = {
    models,
    find: jest.fn(async (model, { where, orderBy, limit, offset }) => {
      const found = rows(model).filter((row) => matches(row, where));
      for (const entry of [...(orderBy ?? [])].reverse()) {
        const [[property, direction]] = Object.entries(entry);
        found.sort((a, b) =>
          (a[property] as number) > (b[property] as number)
            ? direction === 'ASC'
              ? 1
              : -1
            : direction === 'ASC'
              ? -1
              : 1,
        );
      }
      return found.slice(offset ?? 0, (offset ?? 0) + (limit ?? found.length));
    }),
    count: async (model, where) =>
      rows(model).filter((row) => matches(row, where)).length,
    findOne: async (model, key) => byKey(model, key),
    insert: async (model, input) => {
      const id = (nextId.get(model.name) ?? 0) + 1;
      nextId.set(model.name, id);
      const record = {
        ...(model.primaryKey.includes('id') ? { id } : {}),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        ...input,
      };
      rows(model).push(record);
      return record;
    },
    update: async (model, key, input) => {
      const record = byKey(model, key);
      if (record) Object.assign(record, input);
      return record;
    },
    delete: async (model, key) => {
      const record = byKey(model, key);
      if (record) rows(model).splice(rows(model).indexOf(record), 1);
      return record;
    },
    upsert: async (model, input) => {
      const record = byKey(model, input);
      if (record) return Object.assign(record, input);
      return connection.insert(model, input);
    },
    insertMany: async (model, inputs) => {
      for (const input of inputs) await connection.insert(model, input);
      return inputs.length;
    },
    deleteMany: async (model, where) => {
      const doomed = rows(model).filter((row) => matches(row, where));
      tables.set(
        model.name,
        rows(model).filter((row) => !doomed.includes(row)),
      );
      return doomed.length;
    },
    nullsFirst: true,
    close: async () => {},
  };
  return connection;
}

describe('generated GraphQL API', () => {
  let connection: DatabaseConnection;
  let run: (source: string) => Promise<Record<string, unknown>>;

  beforeEach(() => {
    connection = memoryConnection([...blogModels(), ...otherModels()]);
    const schema = executableSchema(connection);
    run = async (source) => {
      const result = await graphql({ schema, source, contextValue: {} });
      expect(result.errors).toBeUndefined();
      return result.data as Record<string, unknown>;
    };
  });

  async function seed() {
    await run(`mutation {
      ada: createAuthor(input: { fullName: "Ada" }) { id }
      alan: createAuthor(input: { fullName: "Alan" }) { id }
      a: createBlogPost(input: { authorId: 1, title: "Engines" }) { id }
      b: createBlogPost(input: { authorId: 1, title: "Notes" }) { id }
      c: createBlogPost(input: { authorId: 2, title: "Machines" }) { id }
    }`);
  }

  it('creates, reads, updates and deletes by primary key', async () => {
    await expect(
      run(
        'mutation { createAuthor(input: { fullName: "Ada" }) { id fullName createdAt } }',
      ),
    ).resolves.toEqual({
      createAuthor: {
        id: 1,
        fullName: 'Ada',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    await expect(
      run(
        'mutation { updateAuthor(id: 1, input: { fullName: "Ada L." }) { fullName } }',
      ),
    ).resolves.toEqual({ updateAuthor: { fullName: 'Ada L.' } });
    await expect(run('{ author(id: 1) { fullName } }')).resolves.toEqual({
      author: { fullName: 'Ada L.' },
    });
    await expect(
      run('mutation { deleteAuthor(id: 1) { id } }'),
    ).resolves.toEqual({ deleteAuthor: { id: 1 } });
    await expect(run('{ author(id: 1) { id } }')).resolves.toEqual({
      author: null,
    });
  });

  it('filters, orders, counts and pages a list within the limits', async () => {
    await seed();
    await expect(
      run(`{
        blogPosts(where: { title: { contains: "e" } }, orderBy: [{ title: DESC }], limit: 10) { title }
        blogPostsCount(where: { authorId: { eq: 1 } })
      }`),
    ).resolves.toEqual({
      // maxLimit is 3, so a limit of 10 still returns at most 3.
      blogPosts: [
        { title: 'Notes' },
        { title: 'Machines' },
        { title: 'Engines' },
      ],
      blogPostsCount: 2,
    });
    // Without a limit the default of 2 applies, sorted by primary key.
    await expect(run('{ blogPosts(offset: 1) { id } }')).resolves.toEqual({
      blogPosts: [{ id: 2 }, { id: 3 }],
    });
  });

  it('follows relations both ways, batching the lookups', async () => {
    await seed();
    (connection.find as jest.Mock).mockClear();
    await expect(
      run('{ blogPosts(limit: 3) { title author { fullName } } }'),
    ).resolves.toEqual({
      blogPosts: [
        { title: 'Engines', author: { fullName: 'Ada' } },
        { title: 'Notes', author: { fullName: 'Ada' } },
        { title: 'Machines', author: { fullName: 'Alan' } },
      ],
    });
    // One query for the posts and one for all their authors.
    expect(connection.find).toHaveBeenCalledTimes(2);

    await expect(
      run(
        '{ authors { fullName blogPosts(where: { title: { contains: "ote" } }) { title } } }',
      ),
    ).resolves.toEqual({
      authors: [
        { fullName: 'Ada', blogPosts: [{ title: 'Notes' }] },
        { fullName: 'Alan', blogPosts: [] },
      ],
    });
  });

  it('exposes a table without a primary key only as a list', async () => {
    const data = await run(`{
      query: __type(name: "Query") { fields { name } }
      mutation: __type(name: "Mutation") { fields { name } }
    }`);
    const names = (type: string) =>
      (data[type] as { fields: { name: string }[] }).fields.map((f) => f.name);
    expect(names('query')).toEqual(
      expect.arrayContaining(['logs', 'logsCount']),
    );
    expect(names('query')).not.toContain('log');
    expect(names('mutation')).toContain('createLog');
    expect(names('mutation')).not.toContain('updateLog');
  });

  describe('cursor connections', () => {
    const page = async (args: string) =>
      (
        await run(`{
          blogPostsConnection(${args}) {
            edges { cursor node { id } }
            pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
            totalCount
          }
        }`)
      ).blogPostsConnection as {
        edges: { cursor: string; node: { id: number } }[];
        pageInfo: Record<string, unknown>;
        totalCount: number;
      };
    const ids = (found: Awaited<ReturnType<typeof page>>) =>
      found.edges.map((edge) => edge.node.id);

    beforeEach(seed);

    it('pages forward from a cursor', async () => {
      const first = await page('first: 2');
      expect(ids(first)).toEqual([1, 2]);
      expect(first.pageInfo).toMatchObject({
        hasNextPage: true,
        hasPreviousPage: false,
        endCursor: first.edges[1].cursor,
      });
      expect(first.totalCount).toBe(3);

      const next = await page(`first: 2, after: "${first.pageInfo.endCursor}"`);
      expect(ids(next)).toEqual([3]);
      expect(next.pageInfo).toMatchObject({
        hasNextPage: false,
        hasPreviousPage: true,
      });
    });

    it('pages backward with last and before', async () => {
      const last = await page('last: 2');
      expect(ids(last)).toEqual([2, 3]);
      expect(last.pageInfo.hasPreviousPage).toBe(true);
      const before = await page(
        `last: 2, before: "${last.pageInfo.startCursor}"`,
      );
      expect(ids(before)).toEqual([1]);
      expect(before.pageInfo).toMatchObject({
        hasNextPage: true,
        hasPreviousPage: false,
      });
    });

    it('keeps the order asked for, then the primary key', async () => {
      const first = await page('orderBy: [{ title: DESC }], first: 1');
      expect(ids(first)).toEqual([2]);
      const rest = await page(
        `orderBy: [{ title: DESC }], first: 5, after: "${first.pageInfo.endCursor}", where: { authorId: { eq: 1 } }`,
      );
      expect(ids(rest)).toEqual([1]);
      expect(rest.totalCount).toBe(2);
    });

    it('refuses a cursor made for another order', async () => {
      const first = await page('first: 1');
      const result = await graphql({
        schema: executableSchema(connection),
        source: `{ blogPostsConnection(orderBy: [{ title: ASC }], after: "${first.pageInfo.endCursor}") { totalCount } }`,
        contextValue: {},
      });
      expect(result.errors?.[0].message).toMatch(/Invalid cursor/);
    });
  });

  describe('upsert and batch mutations', () => {
    const fails = async (source: string) => {
      const result = await graphql({
        schema: executableSchema(connection),
        source,
        contextValue: {},
      });
      return result.errors?.[0].message;
    };

    it('upserts by primary key', async () => {
      await seed();
      await expect(
        run(`mutation {
          updated: upsertAuthor(input: { id: 1, fullName: "Ada L." }) { id fullName }
          created: upsertAuthor(input: { id: 9, fullName: "Grace" }) { id fullName }
        }`),
      ).resolves.toEqual({
        updated: { id: 1, fullName: 'Ada L.' },
        created: { id: 9, fullName: 'Grace' },
      });
      await expect(run('{ authorsCount }')).resolves.toEqual({
        authorsCount: 3,
      });
    });

    it('creates and deletes many within the page limit', async () => {
      await expect(
        run(`mutation {
          createManyAuthors(inputs: [{ fullName: "A" }, { fullName: "B" }])
        }`),
      ).resolves.toEqual({ createManyAuthors: 2 });
      await seed();
      await expect(
        run('mutation { deleteManyBlogPosts(where: { authorId: { eq: 1 } }) }'),
      ).resolves.toEqual({ deleteManyBlogPosts: 2 });
      await expect(run('{ blogPostsCount }')).resolves.toEqual({
        blogPostsCount: 1,
      });

      // maxLimit is 3.
      await expect(
        fails(
          'mutation { createManyAuthors(inputs: [{ fullName: "A" }, { fullName: "B" }, { fullName: "C" }, { fullName: "D" }]) }',
        ),
      ).resolves.toMatch(/at most 3 inputs/);
      await expect(
        fails('mutation { deleteManyAuthors(where: {}) }'),
      ).resolves.toMatch(/would delete 4 records/);
      await expect(run('{ authorsCount }')).resolves.toEqual({
        authorsCount: 4,
      });
    });
  });

  it('exposes a view read-only', async () => {
    const data = await run(`{
      query: __type(name: "Query") { fields { name } }
      mutation: __type(name: "Mutation") { fields { name } }
      input: __type(name: "CreatePublishedPostInput") { name }
    }`);
    const names = (type: string) =>
      (data[type] as { fields: { name: string }[] }).fields.map((f) => f.name);
    expect(names('query')).toEqual(
      expect.arrayContaining([
        'publishedPosts',
        'publishedPostsCount',
        'publishedPost',
        'publishedPostsConnection',
      ]),
    );
    expect(
      names('mutation').filter((name) => name.includes('PublishedPost')),
    ).toEqual([]);
    expect(data.input).toBeNull();
  });

  it('filters by relation through the where inputs', async () => {
    const data = await run(`{
      posts: __type(name: "BlogPostWhere") { inputFields { name type { name } } }
      many: __type(name: "BlogPostManyWhere") { inputFields { name } }
    }`);
    expect(
      (
        data.posts as {
          inputFields: { name: string; type: { name: string } }[];
        }
      ).inputFields,
    ).toContainEqual({ name: 'author', type: { name: 'AuthorWhere' } });
    expect(
      (data.many as { inputFields: { name: string }[] }).inputFields.map(
        (input) => input.name,
      ),
    ).toEqual(['some', 'none', 'every']);

    await run(
      '{ authors(where: { blogPosts: { some: { title: { contains: "x" } } } }) { id } }',
    );
    expect(connection.find).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Author' }),
      expect.objectContaining({
        where: { blogPosts: { some: { title: { contains: 'x' } } } },
      }),
    );
  });

  it('follows composite keys and keys holding arrays', async () => {
    await run(`mutation {
      first: createBookEdition(input: { bookId: 1, edition: 1, label: "First" }) { label }
      second: createBookEdition(input: { bookId: 1, edition: 2, label: "Second" }) { label }
      a: createReview(input: { bookId: 1, edition: 2, stars: 5 }) { id }
      b: createReview(input: { bookId: 1, edition: 2, stars: 3 }) { id }
      x: createTag(input: { id: "x", label: "X" }) { id }
      y: createTag(input: { id: "y", label: "Y" }) { id }
      n: createNote(input: { id: "n", tagIds: ["y", "x"] }) { id }
    }`);
    await expect(
      run(`{
        reviews { stars bookEdition { label } }
        bookEditions(orderBy: [{ edition: ASC }]) { label reviews(where: { stars: { gt: 4 } }) { stars } }
        notes { tags { label } }
        tags { label notes { id } }
      }`),
    ).resolves.toEqual({
      reviews: [
        { stars: 5, bookEdition: { label: 'Second' } },
        { stars: 3, bookEdition: { label: 'Second' } },
      ],
      bookEditions: [
        { label: 'First', reviews: [] },
        { label: 'Second', reviews: [{ stars: 5 }] },
      ],
      notes: [{ tags: [{ label: 'Y' }, { label: 'X' }] }],
      tags: [
        { label: 'X', notes: [{ id: 'n' }] },
        { label: 'Y', notes: [{ id: 'n' }] },
      ],
    });
  });
});

describe('a table whose columns are all key', () => {
  it('gets no update mutation in the schema or the resolvers', () => {
    const postTags: ModelDefinition = {
      name: 'PostTag',
      source: 'post_tags',
      fields: [field('postId', 'Int'), field('tagId', 'Int')],
      primaryKey: ['postId', 'tagId'],
      relations: [],
    };
    const { typeDefs, resolvers } = createSchema(memoryConnection([postTags]), {
      defaultLimit: 2,
      maxLimit: 3,
    });
    const mutation = (resolvers as Record<string, Record<string, unknown>>)
      .Mutation;
    expect(typeDefs).not.toContain('updatePostTag');
    expect(Object.keys(mutation)).toEqual([
      'createPostTag',
      'deletePostTag',
      'createManyPostTags',
      'upsertPostTag',
      'deleteManyPostTags',
    ]);
  });
});
