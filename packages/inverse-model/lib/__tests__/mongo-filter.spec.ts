import type { ModelDefinition } from '../adapters/database-adapter.interface';
import { mongoFilter } from '../adapters/mongodb/mongo-filter';

const field = (
  name: string,
  property: string,
  type: 'ID' | 'String' | 'Int',
) => ({
  name,
  property,
  type,
  isArray: false,
  isNullable: true,
  hasDefault: false,
});

const posts: ModelDefinition = {
  name: 'BlogPost',
  source: 'blog_posts',
  fields: [
    field('_id', 'id', 'ID'),
    field('author_id', 'authorId', 'ID'),
    field('title', 'title', 'String'),
    field('views', 'views', 'Int'),
  ],
  primaryKey: ['id'],
  relations: [],
};

const toId = (value: unknown) => `oid(${value})`;

describe('mongoFilter', () => {
  it('matches everything without a filter', () => {
    expect(mongoFilter(undefined, posts, toId)).toEqual({});
  });

  it('uses field names and converts ID values', () => {
    expect(
      mongoFilter(
        { authorId: { in: ['a', 'b'] }, views: { gt: 3 } },
        posts,
        toId,
      ),
    ).toEqual({
      $and: [
        { author_id: { $in: ['oid(a)', 'oid(b)'] } },
        { views: { $gt: 3 } },
      ],
    });
  });

  it('escapes regex characters in contains and ignores case', () => {
    expect(mongoFilter({ title: { contains: 'a.b' } }, posts, toId)).toEqual({
      title: { $regex: 'a\\.b', $options: 'i' },
    });
  });

  it('nests OR and NOT', () => {
    expect(
      mongoFilter(
        {
          OR: [{ views: { eq: 1 } }, { views: { eq: 2 } }],
          NOT: { title: { isNull: true } },
        },
        posts,
        toId,
      ),
    ).toEqual({
      $and: [
        { $or: [{ views: { $eq: 1 } }, { views: { $eq: 2 } }] },
        { $nor: [{ title: { $eq: null } }] },
      ],
    });
  });
});
