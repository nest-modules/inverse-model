import type {
  DatabaseConnection,
  ModelDefinition,
} from '../adapters/database-adapter.interface';
import { createTypeDefs } from '../graphql/type-defs';
import { withRenames } from '../rename/with-renames';
import { blogModels, memoryDatabase } from './support/memory-database';

describe('withRenames', () => {
  let database: ReturnType<typeof memoryDatabase>;
  let renamed: DatabaseConnection;
  const modelNamed = (name: string) =>
    renamed.models.find((model) => model.name === name) as ModelDefinition;

  beforeEach(() => {
    database = memoryDatabase(blogModels());
    renamed = withRenames(database.connection, {
      tables: { blog_posts: 'Article' },
      fields: {
        'authors.full_name': 'name',
        'blog_posts.author_id': 'writerId',
      },
    });
  });

  it('renames types and fields, and names relations after the new names', () => {
    const article = modelNamed('Article');
    const authors = modelNamed('Authors');
    expect(article).toMatchObject({ source: 'blog_posts' });
    expect(article.fields.map((field) => [field.name, field.property])).toEqual(
      [
        ['id', 'id'],
        ['author_id', 'writerId'],
        ['title', 'title'],
      ],
    );
    expect(article.relations).toEqual([
      {
        property: 'writer',
        kind: 'one',
        target: 'Authors',
        fields: ['writerId'],
        references: ['id'],
      },
    ]);
    expect(authors.relations).toEqual([
      {
        property: 'articles',
        kind: 'many',
        target: 'Article',
        fields: ['id'],
        references: ['writerId'],
      },
    ]);

    const typeDefs = createTypeDefs(renamed.models);
    expect(typeDefs).toContain('type Article {');
    expect(typeDefs).toContain('createArticle(input: CreateArticleInput!)');
    expect(typeDefs).toContain('  name: String!');
    expect(typeDefs).not.toContain('BlogPosts');
  });

  it('leaves the models of the adapter alone', () => {
    expect(database.connection.models.map((model) => model.name)).toEqual([
      'Authors',
      'BlogPosts',
      'AuditLog',
    ]);
    expect(database.connection.models[0].fields[1].property).toBe('fullName');
  });

  it('translates records, keys, filters and orders both ways', async () => {
    const authors = modelNamed('Authors');
    const article = modelNamed('Article');
    const find = jest.spyOn(database.connection, 'find');

    const ada = await renamed.insert(authors, { name: 'Ada' });
    expect(ada).toEqual({ id: 1, name: 'Ada' });
    expect(database.rows('authors')).toEqual([{ id: 1, fullName: 'Ada' }]);

    await renamed.insert(article, { writerId: ada.id, title: 'Engines' });
    await expect(
      renamed.find(article, {
        where: {
          OR: [{ writerId: { eq: ada.id } }],
          NOT: { title: { eq: 'x' } },
        },
        orderBy: [{ writerId: 'ASC' }],
      }),
    ).resolves.toEqual([{ id: 2, writerId: 1, title: 'Engines' }]);
    expect(find).toHaveBeenLastCalledWith(database.connection.models[1], {
      where: { OR: [{ authorId: { eq: 1 } }], NOT: { title: { eq: 'x' } } },
      orderBy: [{ authorId: 'ASC' }],
    });

    await expect(renamed.count(article, { writerId: { eq: 1 } })).resolves.toBe(
      1,
    );
    await expect(
      renamed.update(authors, { id: 1 }, { name: 'Ada L.' }),
    ).resolves.toEqual({ id: 1, name: 'Ada L.' });
    await expect(renamed.findOne(authors, { id: 1 })).resolves.toEqual({
      id: 1,
      name: 'Ada L.',
    });
    await expect(renamed.delete(article, { id: 2 })).resolves.toEqual({
      id: 2,
      writerId: 1,
      title: 'Engines',
    });
  });

  it('renames inside transactions too', async () => {
    const authors = modelNamed('Authors');
    const created = await renamed.transaction?.(({ connection }) =>
      connection.insert(authors, { name: 'Ada' }),
    );
    expect(created).toEqual({ id: 1, name: 'Ada' });
    expect(database.log).toEqual(['begin', 'insert authors', 'commit']);
  });

  it.each([
    [{ tables: { posts: 'Post' } }, 'no table posts'],
    [{ fields: { 'authors.name': 'n' } }, 'no column authors.name'],
    [{ fields: { full_name: 'n' } }, 'no column full_name'],
    [{ tables: { authors: 'Blog Posts' } }, 'not a valid GraphQL name'],
    [
      { tables: { authors: 'BlogPosts' } },
      'two tables would be named BlogPosts',
    ],
    [
      { fields: { 'blog_posts.title': 'id' } },
      'BlogPosts has two fields named id',
    ],
  ])('refuses %j', (rename, message) => {
    expect(() => withRenames(database.connection, rename)).toThrow(message);
  });
});
