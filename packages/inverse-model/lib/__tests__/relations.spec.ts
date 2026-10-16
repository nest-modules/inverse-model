import type { ModelDefinition } from '../adapters/database-adapter.interface';
import { addRelations } from '../adapters/relations';

const model = (name: string, properties: string[]): ModelDefinition => ({
  name,
  source: name.toLowerCase(),
  fields: properties.map((property) => ({
    name: property,
    property,
    type: 'Int',
    isArray: false,
    isNullable: false,
    hasDefault: false,
  })),
  primaryKey: ['id'],
  relations: [],
});

describe('addRelations', () => {
  it('adds both ends of a foreign key', () => {
    const authors = model('Authors', ['id']);
    const posts = model('BlogPosts', ['id', 'authorId']);
    addRelations([
      { source: posts, field: 'authorId', target: authors, reference: 'id' },
    ]);

    expect(posts.relations).toEqual([
      {
        property: 'author',
        kind: 'one',
        target: 'Authors',
        field: 'authorId',
        reference: 'id',
      },
    ]);
    expect(authors.relations).toEqual([
      {
        property: 'blogPosts',
        kind: 'many',
        target: 'BlogPosts',
        field: 'id',
        reference: 'authorId',
      },
    ]);
  });

  it('tells apart two keys to the same table', () => {
    const users = model('Users', ['id']);
    const messages = model('Messages', ['id', 'senderId', 'recipientId']);
    addRelations([
      { source: messages, field: 'senderId', target: users, reference: 'id' },
      {
        source: messages,
        field: 'recipientId',
        target: users,
        reference: 'id',
      },
    ]);

    expect(messages.relations.map((relation) => relation.property)).toEqual([
      'sender',
      'recipient',
    ]);
    expect(users.relations.map((relation) => relation.property)).toEqual([
      'messagesBySenderId',
      'messagesByRecipientId',
    ]);
  });

  it('names a key without an id suffix after its target, avoiding taken names', () => {
    const users = model('Users', ['id']);
    const tasks = model('Tasks', ['id', 'owner', 'users']);
    addRelations([
      { source: tasks, field: 'owner', target: users, reference: 'id' },
    ]);

    expect(tasks.relations[0].property).toBe('users2');
  });
});
