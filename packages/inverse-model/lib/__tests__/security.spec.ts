import { getIntrospectionQuery } from 'graphql';
import type {
  DatabaseConnection,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import type { CacheStore } from '../cache/cache-store.interface';
import { withCache } from '../cache/cached-connection';
import { withScope } from '../security/access-hooks';
import { createRedactor } from '../security/redact';
import { restrictModels } from '../security/restrict-models';
import { openRestricted } from '../security/secure-api';
import {
  logger,
  memoryConnection,
  type Response,
  serve,
  tenantModels,
} from './support/memory-api';

type Api = Awaited<ReturnType<typeof serve>>;

const fieldNames = async (api: Api, type: string) => {
  const { data } = await api.run(
    `{ __type(name: "${type}") { fields { name } inputFields { name } } }`,
  );
  const found = data?.__type;
  if (!found) return null;
  return [...(found.fields ?? []), ...(found.inputFields ?? [])].map(
    (field: { name: string }) => field.name,
  );
};

const codes = (response: Response) =>
  (response.errors ?? []).map((error) => error.extensions?.code);

describe('security', () => {
  let connection: DatabaseConnection;
  let api: Api | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    connection = memoryConnection(tenantModels());
  });
  afterEach(async () => {
    await api?.stop();
    api = undefined;
    jest.restoreAllMocks();
  });

  async function seed() {
    const writer = await serve(connection);
    const response = await writer.run(`mutation {
      a: createAuthors(input: { fullName: "Ada", tenantId: 1, passwordHash: "x" }) { id }
      b: createAuthors(input: { fullName: "Bea", tenantId: 2 }) { id }
      p1: createBlogPosts(input: { authorId: 1, title: "Engines", tenantId: 1 }) { id }
      p2: createBlogPosts(input: { authorId: 1, title: "Notes", tenantId: 1 }) { id }
      p3: createBlogPosts(input: { authorId: 2, title: "Looms", tenantId: 2 }) { id }
      p4: createBlogPosts(input: { authorId: 2, title: "Spy", tenantId: 1 }) { id }
    }`);
    expect(response.errors).toBeUndefined();
    await writer.stop();
    jest.clearAllMocks();
  }

  describe('include and exclude', () => {
    const names = (models: ModelDefinition[]) =>
      Object.fromEntries(
        models.map((model) => [
          model.name,
          model.fields.map((field) => field.property),
        ]),
      );

    it('matches tables by bare or schema-qualified name, and fields by table.column', () => {
      expect(
        names(
          restrictModels(tenantModels(), {
            exclude: ['audit_*', 'public.authors.password_hash'],
          }),
        ),
      ).toEqual({
        Authors: ['id', 'fullName', 'tenantId'],
        BlogPosts: ['id', 'authorId', 'title', 'tenantId'],
      });
      expect(
        names(
          restrictModels(tenantModels(), {
            include: ['authors', 'blog_posts.id', 'blog_posts.title'],
            exclude: ['*.tenant_id'],
          }),
        ),
      ).toEqual({
        Authors: ['id', 'fullName', 'passwordHash'],
        BlogPosts: ['id', 'title'],
      });
    });

    it('drops relations to hidden tables or through hidden keys', () => {
      const [posts] = restrictModels(tenantModels(), { exclude: ['authors'] });
      expect(posts.relations).toEqual([]);

      const [authors, blogPosts] = restrictModels(tenantModels(), {
        exclude: ['blog_posts.author_id'],
      });
      expect(authors.relations).toEqual([]);
      expect(blogPosts.relations).toEqual([]);
    });

    it('leaves a table whose key is hidden without by-key operations', () => {
      const [authors] = restrictModels(tenantModels(), {
        exclude: ['authors.id'],
      });
      expect(authors.primaryKey).toEqual([]);
    });

    it('removes hidden fields from types, inputs, filters and ordering', async () => {
      await seed();
      api = await serve(connection, {
        exclude: ['*.password_hash', 'audit_logs'],
      });
      for (const type of [
        'Authors',
        'AuthorsWhere',
        'AuthorsOrderBy',
        'CreateAuthorsInput',
        'UpdateAuthorsInput',
      ]) {
        expect(await fieldNames(api, type)).not.toContain('passwordHash');
      }
      expect(await fieldNames(api, 'AuditLogs')).toBeNull();
      expect(await fieldNames(api, 'Query')).not.toContain('auditLogs');

      const response = await api.run(
        '{ authors(where: { passwordHash: { eq: "x" } }) { id } }',
      );
      expect(codes(response)).toEqual(['GRAPHQL_VALIDATION_FAILED']);
    });
  });

  describe('readOnly', () => {
    it('omits the Mutation type when nothing is writable', async () => {
      api = await serve(connection, { readOnly: true });
      expect(await fieldNames(api, 'Mutation')).toBeNull();
      expect(await fieldNames(api, 'Query')).toContain('authorsByPk');
    });

    it('omits only the mutations of the tables listed', async () => {
      api = await serve(connection, { readOnly: ['authors', 'audit_*'] });
      expect(await fieldNames(api, 'Mutation')).toEqual([
        'createBlogPosts',
        'updateBlogPosts',
        'deleteBlogPosts',
      ]);
    });

    it('refuses writes to read-only tables on the connection too', async () => {
      const restricted = await openRestricted(
        { url: 'postgres://db/blog', readOnly: true },
        async () => connection,
      );
      await expect(
        restricted.insert(restricted.models[0], { fullName: 'Ada' }),
      ).rejects.toThrow('Authors is read-only');
      expect(connection.insert).not.toHaveBeenCalled();
    });
  });

  describe('query limits', () => {
    // Lists of one row, so only the depth adds up.
    const nested = (levels: number) =>
      `{ blogPosts(limit: 1) { ${'author { blogPosts(limit: 1) { '.repeat(levels)}id${' } }'.repeat(levels)} } }`;

    it('turns away queries nested deeper than maxDepth', async () => {
      api = await serve(connection, { queryLimits: { maxDepth: 4 } });
      expect((await api.run(nested(1))).errors).toBeUndefined();
      const response = await api.run(nested(2));
      expect(codes(response)).toEqual(['GRAPHQL_VALIDATION_FAILED']);
      expect(response.errors?.[0].message).toMatch(/nested 6 levels/);
    });

    it('defaults to a depth of 10, not counting introspection', async () => {
      api = await serve(connection);
      expect((await api.run(nested(4))).errors).toBeUndefined();
      expect(codes(await api.run(nested(5)))).toEqual([
        'GRAPHQL_VALIDATION_FAILED',
      ]);
      expect((await api.run(getIntrospectionQuery())).errors).toBeUndefined();
    });

    it('turns away queries that cost more than maxComplexity', async () => {
      api = await serve(connection, { queryLimits: { maxComplexity: 300 } });
      // 1 + 10 rows × (1 + 1 + 10 rows × 1) with the default page of 10.
      const twoLevels = '{ authors { id blogPosts { id } } }';
      expect((await api.run(twoLevels)).errors).toBeUndefined();
      const response = await api.run(
        '{ authors(limit: 50) { id blogPosts { id } } }',
      );
      expect(codes(response)).toEqual(['GRAPHQL_VALIDATION_FAILED']);
      expect(response.errors?.[0].message).toMatch(/costs 601/);
      // Fragments count too.
      expect(
        codes(
          await api.run(`{ authors(limit: 50) { ...A } }
            fragment A on Authors { id blogPosts { id } }`),
        ),
      ).toEqual(['GRAPHQL_VALIDATION_FAILED']);
    });
  });

  describe('errors', () => {
    it('masks database errors and logs them with the password hidden', async () => {
      const log = logger.error;
      (connection.find as jest.Mock).mockRejectedValueOnce(
        new Error(
          'relation "public.authors" failed for postgres://app:s3cret-pw@db/blog',
        ),
      );
      api = await serve(connection);
      const response = await api.run('{ authors { id } }');

      expect(response.errors).toEqual([
        {
          message: 'Internal server error',
          locations: [{ line: 1, column: 3 }],
          path: ['authors'],
          extensions: {
            code: 'INTERNAL_SERVER_ERROR',
            errorId: expect.any(String),
          },
        },
      ]);
      const [message, stack] = log.mock.calls[0] as string[];
      expect(message).toContain(response.errors?.[0].extensions?.errorId);
      expect(message).toContain('relation "public.authors" failed');
      expect(`${message}${stack}`).not.toContain('s3cret-pw');
    });

    it('keeps validation errors as they are', async () => {
      api = await serve(connection);
      const response = await api.run('{ authors { nope } }');
      expect(response.errors?.[0]).toMatchObject({
        message: 'Cannot query field "nope" on type "Authors".',
        extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
      });
    });

    it('hides the password of a connection string that fails to open', async () => {
      const url = 'postgres://app:s3cret-pw@db:5432/blog';
      const error = await openRestricted({ url }, async () => {
        const failure = new Error(`connect ECONNREFUSED ${url}`);
        Object.assign(failure, { input: url });
        throw failure;
      }).catch((caught) => caught);
      expect(error.message).toBe(
        'connect ECONNREFUSED postgres://app:****@db:5432/blog',
      );
      expect(error.input).not.toContain('s3cret-pw');
      expect(error.stack).not.toContain('s3cret-pw');
    });

    it('redacts URL passwords, password parameters and known passwords', () => {
      const redact = createRedactor([
        'mssql://sa:Inverse%40Pw0rd@db/blog',
        'redis://:redis-pw@cache:6379',
      ]);
      expect(
        redact(
          'mongodb://u:p@h/db?password=abc&x=1 Login failed: Inverse@Pw0rd redis-pw',
        ),
      ).toBe('mongodb://u:****@h/db?password=****&x=1 Login failed: **** ****');
    });
  });

  describe('authorize', () => {
    it('is asked for every operation, relation fields included', async () => {
      await seed();
      const authorize = jest.fn(
        ({ operation, model }) =>
          !(operation === 'delete' || model === 'public.authors'),
      );
      api = await serve(connection, { authorize });
      const context = { user: 'ada' };

      const listed = await api.run('{ blogPosts { title } }', context);
      expect(listed.errors).toBeUndefined();
      expect(authorize).toHaveBeenCalledWith({
        model: 'public.blog_posts',
        type: 'BlogPosts',
        operation: 'list',
        context,
        args: {},
      });

      const related = await api.run('{ blogPosts { author { id } } }');
      expect(codes(related)).toContain('FORBIDDEN');
      expect(related.errors?.[0].message).toBe('Not allowed to list Authors');
      expect(connection.find).toHaveBeenCalledTimes(2);

      const deleted = await api.run(
        'mutation { deleteBlogPosts(id: 3) { id } }',
      );
      expect(codes(deleted)).toEqual(['FORBIDDEN']);
      expect(connection.delete).not.toHaveBeenCalled();
    });

    it('sees the arguments, e.g. the input of a create', async () => {
      const authorize = jest.fn(
        async ({ args, context }) =>
          (args.input as { tenantId?: number } | undefined)?.tenantId ===
          context.tenantId,
      );
      api = await serve(connection, { authorize });
      const create = (tenantId: number) =>
        api?.run(
          `mutation { createBlogPosts(input: { authorId: 1, title: "x", tenantId: ${tenantId} }) { id } }`,
          { tenantId: 1 },
        );
      expect((await create(1))?.errors).toBeUndefined();
      expect(codes((await create(2)) as Response)).toEqual(['FORBIDDEN']);
    });
  });

  describe('scope', () => {
    const scope = jest.fn(({ context }) => ({
      tenantId: { eq: context.tenantId },
    }));
    const as = (tenantId: number) => ({ tenantId });

    it('filters lists, counts and lookups by key', async () => {
      await seed();
      api = await serve(connection, { scope });
      await expect(
        api.run(
          '{ blogPosts { title } blogPostsCount authorsByPk(id: 2) { id } }',
          as(1),
        ),
      ).resolves.toEqual({
        data: {
          blogPosts: [
            { title: 'Engines' },
            { title: 'Notes' },
            { title: 'Spy' },
          ],
          blogPostsCount: 3,
          authorsByPk: null,
        },
      });
      expect(scope).toHaveBeenCalledWith({
        model: 'public.blog_posts',
        type: 'BlogPosts',
        operation: 'count',
        context: as(1),
      });
    });

    it('filters relations, batched or not', async () => {
      await seed();
      // Bea is in tenant 2 but wrote "Spy" in tenant 1, which tenant 2 must not see.
      api = await serve(connection, { scope });
      const response = await api.run(
        '{ authors { fullName blogPosts { title } paged: blogPosts(limit: 5) { title } } }',
        as(2),
      );
      expect(response).toEqual({
        data: {
          authors: [
            {
              fullName: 'Bea',
              blogPosts: [{ title: 'Looms' }],
              paged: [{ title: 'Looms' }],
            },
          ],
        },
      });

      const crossTenant = await api.run(
        '{ blogPosts { title author { fullName } } }',
        as(1),
      );
      expect(crossTenant.data?.blogPosts).toEqual([
        { title: 'Engines', author: { fullName: 'Ada' } },
        { title: 'Notes', author: { fullName: 'Ada' } },
        { title: 'Spy', author: null },
      ]);
      const batched = (connection.find as jest.Mock).mock.calls.at(-1)?.[1];
      expect(batched.where).toEqual({
        AND: [{ id: { in: [1, 2] } }, { tenantId: { eq: 1 } }],
      });
    });

    it('only updates and deletes rows within the scope', async () => {
      await seed();
      api = await serve(connection, { scope });
      await expect(
        api.run(
          'mutation { updateAuthors(id: 2, input: { fullName: "X" }) { id } deleteAuthors(id: 2) { id } }',
          as(1),
        ),
      ).resolves.toEqual({
        data: { updateAuthors: null, deleteAuthors: null },
      });
      expect(connection.update).not.toHaveBeenCalled();
      expect(connection.delete).not.toHaveBeenCalled();

      await expect(
        api.run(
          'mutation { updateAuthors(id: 2, input: { fullName: "Bee" }) { fullName } }',
          as(2),
        ),
      ).resolves.toEqual({ data: { updateAuthors: { fullName: 'Bee' } } });
    });

    it('scopes writes that hooks run inside a transaction', async () => {
      await seed();
      // Hooks make writes go through the transaction's own connection.
      connection.transaction = (work) => work({ connection, active: true });
      const beforeUpdate = jest.fn(({ input }) => input);
      api = await serve(connection, {
        scope,
        hooks: { '*': { beforeUpdate } },
      });
      await expect(
        api.run(
          'mutation { updateAuthors(id: 2, input: { fullName: "X" }) { id } }',
          as(1),
        ),
      ).resolves.toEqual({ data: { updateAuthors: null } });
      expect(connection.update).not.toHaveBeenCalled();

      // Within the tenant, the hook still runs in the transaction.
      await api.run(
        'mutation { updateAuthors(id: 1, input: { fullName: "Ada L." }) { id } }',
        as(1),
      );
      expect(beforeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({ active: true }),
        }),
      );
    });

    it('keeps tenants apart in the cache', async () => {
      await seed();
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
      const cached = withCache(connection, store, {
        ttl: 60,
        ttlByTable: {},
        keyPrefix: 'test:',
        onError: (error) => {
          throw error;
        },
      });
      api = await serve(cached, { scope });
      const titles = async (tenantId: number) =>
        (await api?.run('{ blogPosts { title } }', as(tenantId)))?.data;

      expect(await titles(1)).toEqual({
        blogPosts: [{ title: 'Engines' }, { title: 'Notes' }, { title: 'Spy' }],
      });
      expect(await titles(2)).toEqual({ blogPosts: [{ title: 'Looms' }] });
      expect(await titles(2)).toEqual({ blogPosts: [{ title: 'Looms' }] });
      // Each tenant read the database once; the second read of tenant 2 was cached.
      expect(connection.find).toHaveBeenCalledTimes(2);
    });

    it('refuses calls that come from no GraphQL request', async () => {
      api = await serve(connection, { scope });
      const scoped = withScope(connection, scope);
      await expect(scoped.find(api.models[0], {})).rejects.toThrow(
        'No GraphQL request',
      );
    });
  });
});
