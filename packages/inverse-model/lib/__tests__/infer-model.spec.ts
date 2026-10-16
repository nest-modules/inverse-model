import { DBRef, Decimal128, ObjectId } from 'mongodb';
import {
  inferDbRefs,
  inferForeignKeys,
  inferModel,
} from '../adapters/mongodb/infer-model';

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
      {
        source: model,
        fields: ['authorId'],
        target: authors,
        references: ['id'],
      },
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
        fields: ['categoryId'],
        target: categories,
        references: ['id'],
      },
    ]);
  });

  describe('references beyond names', () => {
    const authors = inferModel('authors', [{ _id: new ObjectId() }]);
    const tags = inferModel('tags', [{ _id: new ObjectId() }]);
    const documents = [
      {
        _id: new ObjectId(),
        writer: new DBRef('authors', new ObjectId()),
        tag_ids: [new ObjectId(), new ObjectId()],
        labels: [],
      },
    ];
    const notes = inferModel('notes', documents);
    const fieldNamed = (property: string) =>
      notes.fields.find((field) => field.property === property);

    it('types DBRefs as ids and arrays of ids as ID lists', () => {
      expect(fieldNamed('writer')).toMatchObject({
        type: 'ID',
        isArray: false,
      });
      expect(fieldNamed('tagIds')).toMatchObject({ type: 'ID', isArray: true });
      expect(fieldNamed('labels')).toMatchObject({
        type: 'JSON',
        isArray: false,
      });
    });

    it('reads the collection of a DBRef and the target of an id list', () => {
      const dbRefs = new Map([['notes', inferDbRefs(documents)]]);
      expect(dbRefs.get('notes')).toEqual(new Map([['writer', 'authors']]));
      expect(inferForeignKeys([authors, tags, notes], dbRefs)).toEqual([
        {
          source: notes,
          fields: ['writer'],
          target: authors,
          references: ['id'],
        },
        { source: notes, fields: ['tagIds'], target: tags, references: ['id'] },
      ]);
    });
  });
});
