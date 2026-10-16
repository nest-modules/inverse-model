import { Decimal128, ObjectId } from 'mongodb';
import { inferModel } from '../adapters/mongodb/infer-model';

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

  it('names the model after the collection', () => {
    expect(model.name).toBe('BlogPosts');
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
});
