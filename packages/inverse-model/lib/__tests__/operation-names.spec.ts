import type { ModelDefinition } from '../adapters/database-adapter.interface';
import { operationNames } from '../graphql/operation-names';

const model = (name: string, plural?: string): ModelDefinition => ({
  name,
  plural,
  source: name.toLowerCase(),
  fields: [],
  primaryKey: ['id'],
  relations: [],
});

describe('operationNames', () => {
  it('names lists in the plural and the rest in the singular', () => {
    expect(operationNames(model('BlogPost'))).toEqual({
      list: 'blogPosts',
      count: 'blogPostsCount',
      byPk: 'blogPost',
      connection: 'blogPostsConnection',
      create: 'createBlogPost',
      update: 'updateBlogPost',
      delete: 'deleteBlogPost',
      upsert: 'upsertBlogPost',
      createMany: 'createManyBlogPosts',
      deleteMany: 'deleteManyBlogPosts',
    });
  });

  it('uses the irregular plural', () => {
    expect(operationNames(model('Person'))).toMatchObject({
      list: 'people',
      count: 'peopleCount',
      byPk: 'person',
    });
  });

  it('uses the plural the model carries', () => {
    expect(operationNames(model('Person', 'Persons')).list).toBe('persons');
  });

  it('keeps the by-key query apart from a list of the same name', () => {
    expect(operationNames(model('News'))).toMatchObject({
      list: 'news',
      byPk: 'newsByPk',
    });
  });
});
