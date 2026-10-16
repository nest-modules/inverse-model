import {
  buildSchema,
  type GraphQLFieldResolver,
  GraphQLObjectType,
  GraphQLScalarType,
  graphql,
} from 'graphql';
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
    name: 'Authors',
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
    name: 'BlogPosts',
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
    name: 'Logs',
    source: 'logs',
    fields: [field('message', 'String')],
    primaryKey: [],
    relations: [],
  };
  addRelations([
    { source: posts, field: 'authorId', target: authors, reference: 'id' },
  ]);
  return [authors, posts, logs];
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
    const actual = record[key];
    return (
      (filter.eq == null || actual === filter.eq) &&
      (filter.in == null || filter.in.includes(actual)) &&
      (filter.contains == null ||
        String(actual).toLowerCase().includes(filter.contains.toLowerCase()))
    );
  });

/** Enough of a database for the API: filters on eq, in and contains, ordering, paging. */
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
    close: async () => {},
  };
  return connection;
}

/** A runnable schema from the SDL and resolvers, as Apollo would build it. */
function executableSchema(connection: DatabaseConnection) {
  const { typeDefs, resolvers } = createSchema(connection, {
    defaultLimit: 2,
    maxLimit: 3,
  });
  const schema = buildSchema(typeDefs);
  for (const [typeName, value] of Object.entries(
    resolvers as Record<string, unknown>,
  )) {
    const type = schema.getType(typeName);
    if (type instanceof GraphQLScalarType) {
      Object.assign(type, value);
    } else if (type instanceof GraphQLObjectType) {
      const fields = type.getFields();
      for (const [name, resolve] of Object.entries(
        value as Record<string, GraphQLFieldResolver<unknown, unknown>>,
      )) {
        fields[name].resolve = resolve;
      }
    }
  }
  return schema;
}

describe('generated GraphQL API', () => {
  let connection: DatabaseConnection;
  let run: (source: string) => Promise<Record<string, unknown>>;

  beforeEach(() => {
    connection = memoryConnection(blogModels());
    const schema = executableSchema(connection);
    run = async (source) => {
      const result = await graphql({ schema, source, contextValue: {} });
      expect(result.errors).toBeUndefined();
      return result.data as Record<string, unknown>;
    };
  });

  async function seed() {
    await run(`mutation {
      ada: createAuthors(input: { fullName: "Ada" }) { id }
      alan: createAuthors(input: { fullName: "Alan" }) { id }
      a: createBlogPosts(input: { authorId: 1, title: "Engines" }) { id }
      b: createBlogPosts(input: { authorId: 1, title: "Notes" }) { id }
      c: createBlogPosts(input: { authorId: 2, title: "Machines" }) { id }
    }`);
  }

  it('creates, reads, updates and deletes by primary key', async () => {
    await expect(
      run(
        'mutation { createAuthors(input: { fullName: "Ada" }) { id fullName createdAt } }',
      ),
    ).resolves.toEqual({
      createAuthors: {
        id: 1,
        fullName: 'Ada',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    await expect(
      run(
        'mutation { updateAuthors(id: 1, input: { fullName: "Ada L." }) { fullName } }',
      ),
    ).resolves.toEqual({ updateAuthors: { fullName: 'Ada L.' } });
    await expect(run('{ authorsByPk(id: 1) { fullName } }')).resolves.toEqual({
      authorsByPk: { fullName: 'Ada L.' },
    });
    await expect(
      run('mutation { deleteAuthors(id: 1) { id } }'),
    ).resolves.toEqual({ deleteAuthors: { id: 1 } });
    await expect(run('{ authorsByPk(id: 1) { id } }')).resolves.toEqual({
      authorsByPk: null,
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
    expect(names('query')).not.toContain('logsByPk');
    expect(names('mutation')).toContain('createLogs');
    expect(names('mutation')).not.toContain('updateLogs');
  });
});
