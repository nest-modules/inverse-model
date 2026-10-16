import type {
  ModelDefinition,
  Where,
} from '../adapters/database-adapter.interface';
import { resolveRelationFilters } from '../adapters/mongodb/relation-filter';
import { addRelations } from '../adapters/relations';

const model = (name: string, properties: string[]): ModelDefinition => ({
  name,
  source: name.toLowerCase(),
  fields: properties.map((property) => ({
    name: property,
    property,
    type: 'ID',
    isArray: false,
    isNullable: true,
    hasDefault: false,
  })),
  primaryKey: ['id'],
  relations: [],
});

describe('resolveRelationFilters', () => {
  const authors = model('Authors', ['id', 'name']);
  const posts = model('Posts', ['id', 'authorId', 'title']);
  addRelations([
    {
      source: posts,
      fields: ['authorId'],
      target: authors,
      references: ['id'],
    },
  ]);
  const models = [authors, posts];
  // Distinct values of a property, standing in for the related collection.
  const distinct = jest.fn(
    async (target: ModelDefinition, where: Where, property: string) => [
      `${target.name}.${property} where ${JSON.stringify(where)}`,
    ],
  );

  it('leaves field filters alone', async () => {
    const where = { title: { eq: 'a' }, OR: [{ id: { eq: '1' } }] };
    await expect(
      resolveRelationFilters(where, posts, models, distinct),
    ).resolves.toEqual(where);
  });

  it('turns a one relation into an in on the key', async () => {
    await expect(
      resolveRelationFilters(
        { author: { name: { eq: 'Ada' } } },
        posts,
        models,
        distinct,
      ),
    ).resolves.toEqual({
      AND: [{ authorId: { in: ['Authors.id where {"name":{"eq":"Ada"}}'] } }],
    });
  });

  it('turns some, none and every into in and NOT in, nesting as it goes', async () => {
    await expect(
      resolveRelationFilters(
        {
          title: { eq: 'x' },
          posts: {
            some: { author: { name: { eq: 'A' } } },
            none: { title: { eq: 'b' } },
            every: { title: { eq: 'c' } },
          },
        },
        authors,
        models,
        distinct,
      ),
    ).resolves.toEqual({
      title: { eq: 'x' },
      AND: [
        {
          id: {
            in: [
              'Posts.authorId where {"AND":[{"authorId":{"in":["Authors.id where {\\"name\\":{\\"eq\\":\\"A\\"}}"]}}]}',
            ],
          },
        },
        { NOT: { id: { in: ['Posts.authorId where {"title":{"eq":"b"}}'] } } },
        {
          NOT: {
            id: { in: ['Posts.authorId where {"NOT":{"title":{"eq":"c"}}}'] },
          },
        },
      ],
    });
  });
});
