import { Decimal128, ObjectId } from 'mongodb';
import { inferForeignKeys, inferModel } from '../adapters/mongodb/infer-model';

describe('inferModel', () => {
  const model = inferModel('blog_posts', [
    {
      _id: new ObjectId(),
      title: 'Hello',
      views: 1,
      rating: 4,
      published_at: new Date(),
      author_id: new ObjectId(),
      tags: ['a'],
      price: Decimal128.fromString('9.99'),
      extra: 'text',
    },
    { _id: new ObjectId(), views: 2, rating: 4.5, extra: 3, draft: null },
  ]);
  const typeOf = (property: string) =>
    model.fields.find((field) => field.property === property)?.type;

  it('names the model after the collection, in the singular', () => {
    expect(model.name).toBe('BlogPost');
    expect(model.plural).toBe('BlogPosts');
  });

  it('names the model and its fields as the naming option says', () => {
    const custom = inferModel('blog_posts', [{ _id: 1, title: 'x' }], {
      type: (collection) => `Mongo_${collection}`,
      field: (name) => name.toUpperCase(),
      plural: (type) => `${type}_list`,
    });
    expect(custom.name).toBe('Mongo_blog_posts');
    expect(custom.plural).toBe('Mongo_blog_posts_list');
    expect(custom.fields.map((field) => field.property)).toEqual([
      'id',
      'TITLE',
    ]);
  });

  it('exposes _id as a required id the database fills in', () => {
    expect(model.fields[0]).toEqual({
      name: '_id',
      property: 'id',
      type: 'ID',
      isArray: false,
      isNullable: false,
      hasDefault: true,
    });
  });

  it.each([
    ['title', 'String'],
    ['views', 'Int'],
    ['rating', 'Float'],
    ['publishedAt', 'DateTime'],
    ['authorId', 'ID'],
    ['tags', 'JSON'],
    ['price', 'String'],
    ['extra', 'JSON'],
  ])('infers %s as %s', (property, type) => {
    expect(typeOf(property)).toBe(type);
  });

  it('leaves out fields that are only ever null', () => {
    expect(typeOf('draft')).toBeUndefined();
  });

  it('keeps every other field optional', () => {
    const others = model.fields.slice(1);
    expect(others.every((field) => field.isNullable && !field.hasDefault)).toBe(
      true,
    );
  });

  it('guesses foreign keys from ID fields named after a collection', () => {
    const authors = inferModel('authors', [{ _id: new ObjectId() }]);
    const tags = inferModel('tags', [{ _id: new ObjectId(), label: 'x' }]);
    const keys = inferForeignKeys([authors, model, tags]);
    expect(keys).toEqual([
      { source: model, field: 'authorId', target: authors, reference: 'id' },
    ]);
  });

  it('finds the collection of a key from its English plural', () => {
    const categories = inferModel('categories', [{ _id: new ObjectId() }]);
    const posts = inferModel('posts', [
      { _id: new ObjectId(), category_id: new ObjectId() },
    ]);
    expect(inferForeignKeys([categories, posts])).toEqual([
      {
        source: posts,
        field: 'categoryId',
        target: categories,
        reference: 'id',
      },
    ]);
  });
});
