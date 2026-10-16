import type {
  DatabaseConnection,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import { createWrites } from '../hooks/writes';
import { withRenames } from '../rename/with-renames';
import { openRestricted } from '../security/secure-api';
import {
  memoryConnection,
  type Response,
  serve,
  tenantModels,
} from './support/memory-api';
import { blogModels, memoryDatabase } from './support/memory-database';

// Connections, upsert, batches and relation filters with the security, rename and hook options.

type Api = Awaited<ReturnType<typeof serve>>;

const codes = (response: Response) =>
  (response.errors ?? []).map((error) => error.extensions?.code);

describe('the new operations with the security options', () => {
  let connection: DatabaseConnection;
  let api: Api | undefined;

  beforeEach(async () => {
    connection = memoryConnection(tenantModels());
    const writer = await serve(connection);
    await writer.run(`mutation {
      a: createAuthors(input: { fullName: "Ada", tenantId: 1 }) { id }
      b: createAuthors(input: { fullName: "Bea", tenantId: 2 }) { id }
      p: createBlogPosts(input: { authorId: 1, title: "Engines", tenantId: 1 }) { id }
    }`);
    await writer.stop();
    jest.clearAllMocks();
  });
  afterEach(async () => {
    await api?.stop();
    api = undefined;
  });

  it('asks authorize for the operations each field runs', async () => {
    const authorize = jest.fn(() => true);
    api = await serve(connection, { authorize });
    const asked = async (query: string) => {
      authorize.mockClear();
      const response = await api?.run(query);
      expect(response?.errors).toBeUndefined();
      return authorize.mock.calls.map(
        (call) =>
          `${(call as unknown as [{ operation: string; type: string }])[0].operation} ${(call as unknown as [{ type: string }])[0].type}`,
      );
    };

    await expect(
      asked('{ blogPostsConnection(first: 1) { totalCount } }'),
    ).resolves.toEqual(['list BlogPosts']);
    await expect(
      asked(
        '{ authors(where: { blogPosts: { some: { title: { eq: "x" } } } }) { id } }',
      ),
    ).resolves.toEqual(['list Authors', 'list BlogPosts']);
    await expect(
      asked(
        'mutation { upsertAuthors(input: { id: 1, fullName: "A", tenantId: 1 }) { id } }',
      ),
    ).resolves.toEqual(['create Authors', 'update Authors']);
    await expect(
      asked(
        'mutation { createManyAuthors(inputs: [{ fullName: "C", tenantId: 1 }]) }',
      ),
    ).resolves.toEqual(['create Authors']);
    await expect(
      asked('mutation { deleteManyBlogPosts(where: { title: { eq: "x" } }) }'),
    ).resolves.toEqual(['delete BlogPosts']);
  });

  it('refuses a relation filter on a model the request may not list', async () => {
    api = await serve(connection, {
      authorize: ({ type }) => type !== 'BlogPosts',
    });
    const response = await api.run(
      '{ authors(where: { blogPosts: { some: { title: { eq: "x" } } } }) { id } }',
    );
    expect(codes(response)).toEqual(['FORBIDDEN']);
  });

  it('gives read-only tables none of the new mutations, on the connection either', async () => {
    api = await serve(connection, { readOnly: ['authors'] });
    const { data } = await api.run(
      '{ __type(name: "Mutation") { fields { name } } }',
    );
    const names = data?.__type.fields.map((f: { name: string }) => f.name);
    expect(names).not.toContain('upsertAuthors');
    expect(names).not.toContain('createManyAuthors');
    expect(names).toContain('createManyBlogPosts');

    const restricted = await openRestricted(
      { url: 'postgres://db/blog', readOnly: true },
      async () => connection,
    );
    const [authors] = restricted.models;
    await expect(restricted.upsert(authors, { id: 1 })).rejects.toThrow(
      /read-only/,
    );
    await expect(restricted.insertMany(authors, [{}])).rejects.toThrow(
      /read-only/,
    );
    await expect(restricted.deleteMany(authors, {})).rejects.toThrow(
      /read-only/,
    );
  });

  describe('scope', () => {
    const scope = jest.fn(({ context }) => ({
      tenantId: { eq: context.tenantId },
    }));
    const as = (tenantId: number) => ({ tenantId });

    it('narrows relation filters to the rows in scope', async () => {
      api = await serve(connection, { scope });
      await api.run(
        '{ authors(where: { blogPosts: { some: { title: { eq: "x" } }, every: { title: { eq: "y" } } } }) { id } }',
        as(1),
      );
      const tenant = { tenantId: { eq: 1 } };
      expect(
        (connection.find as jest.Mock).mock.calls.at(-1)?.[1].where,
      ).toEqual({
        AND: [
          {
            blogPosts: {
              some: { AND: [{ title: { eq: 'x' } }, tenant] },
              every: { OR: [{ title: { eq: 'y' } }, { NOT: tenant }] },
            },
          },
          tenant,
        ],
      });
    });

    it('scopes connections and deleteMany, and refuses to upsert a row outside it', async () => {
      api = await serve(connection, { scope });
      const listed = await api.run(
        '{ authorsConnection(first: 5) { edges { node { fullName } } totalCount } }',
        as(2),
      );
      expect(listed.errors).toBeUndefined();
      expect(listed.data?.authorsConnection).toEqual({
        edges: [{ node: { fullName: 'Bea' } }],
        totalCount: 1,
      });

      await expect(
        api.run('mutation { deleteManyAuthors(where: {}) }', as(2)),
      ).resolves.toEqual({ data: { deleteManyAuthors: 1 } });
      expect(connection.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Authors' }),
        { AND: [{}, { tenantId: { eq: 2 } }] },
      );

      const upserted = await api.run(
        'mutation { upsertAuthors(input: { id: 1, fullName: "Mine", tenantId: 2 }) { id } }',
        as(2),
      );
      expect(codes(upserted)).toEqual(['FORBIDDEN']);
      expect(connection.upsert).not.toHaveBeenCalled();
    });
  });

  it('costs a connection by its page size, once', async () => {
    api = await serve(connection, { queryLimits: { maxComplexity: 30 } });
    // 1 + 5 × (edges 1 + node 1 + fullName 1) + 1 for totalCount… within 30.
    const small = await api.run(
      '{ authorsConnection(first: 5) { edges { node { fullName } } totalCount } }',
    );
    expect(small.errors).toBeUndefined();
    const large = await api.run(
      '{ authorsConnection(first: 50) { edges { node { fullName } } } }',
    );
    expect(codes(large)).toEqual(['GRAPHQL_VALIDATION_FAILED']);
  });
});

describe('the new operations with renames and hooks', () => {
  let database: ReturnType<typeof memoryDatabase>;
  let authors: ModelDefinition;

  beforeEach(() => {
    database = memoryDatabase(blogModels());
    [authors] = database.connection.models;
  });

  it('renames the relations and fields of relation filters', async () => {
    const renamed = withRenames(database.connection, {
      tables: { blog_posts: 'Article' },
      fields: { 'blog_posts.title': 'headline' },
    });
    const find = jest.spyOn(database.connection, 'find');
    const writer = renamed.models[0];
    expect(writer.relations[0].property).toBe('articles');
    await renamed.find(writer, {
      where: { articles: { some: { headline: { eq: 'x' } } } },
    });
    expect(find).toHaveBeenLastCalledWith(database.connection.models[0], {
      where: { blogPosts: { some: { title: { eq: 'x' } } } },
    });
  });

  it('runs the hooks of each record of a batch or upsert, in one transaction', async () => {
    const calls: string[] = [];
    const writes = createWrites(database.connection, {
      authors: {
        beforeCreate: ({ input }) => {
          calls.push(`create ${input.fullName}`);
        },
        beforeUpdate: ({ input }) => {
          calls.push(`update ${input.fullName}`);
        },
        beforeDelete: ({ record }) => {
          calls.push(`delete ${record?.fullName}`);
        },
      },
    });

    await expect(
      writes.createMany(authors, [{ fullName: 'Ada' }, { fullName: 'Bea' }]),
    ).resolves.toBe(2);
    await writes.upsert(authors, { id: 1, fullName: 'Ada L.' });
    await writes.upsert(authors, { id: 9, fullName: 'Cy' });
    await expect(
      writes.deleteMany(authors, { id: { in: [1, 2] } }),
    ).resolves.toBe(2);

    expect(calls).toEqual([
      'create Ada',
      'create Bea',
      'update Ada L.',
      'create Cy',
      'delete Ada L.',
      'delete Bea',
    ]);
    expect(database.log.filter((entry) => entry === 'begin')).toHaveLength(4);
    expect(database.rows('authors')).toEqual([{ id: 9, fullName: 'Cy' }]);
  });

  it('writes a batch in one call when the table has no hooks', async () => {
    const writes = createWrites(database.connection, {});
    await writes.createMany(authors, [{ fullName: 'Ada' }]);
    await writes.deleteMany(authors, {});
    await writes.upsert(authors, { fullName: 'Bea' });
    expect(database.log).toEqual([
      'insertMany authors',
      'deleteMany authors',
      'upsert authors',
    ]);
  });
});
