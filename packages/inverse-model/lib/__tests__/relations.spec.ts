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
    const authors = model('Author', ['id']);
    const posts = model('BlogPost', ['id', 'authorId']);
    addRelations([
      { source: posts, field: 'authorId', target: authors, reference: 'id' },
    ]);

    expect(posts.relations).toEqual([
      {
        property: 'author',
        kind: 'one',
        target: 'Author',
        field: 'authorId',
        reference: 'id',
      },
    ]);
    expect(authors.relations).toEqual([
      {
        property: 'blogPosts',
        kind: 'many',
        target: 'BlogPost',
        field: 'id',
        reference: 'authorId',
      },
    ]);
  });

  it('names the way back with the plural the model gives', () => {
    const people = model('Person', ['id']);
    const posts = { ...model('Post', ['id', 'authorId']), plural: 'Writings' };
    addRelations([
      { source: posts, field: 'authorId', target: people, reference: 'id' },
    ]);
    expect(people.relations[0].property).toBe('writings');
  });

  it('tells apart two keys to the same table', () => {
    const users = model('User', ['id']);
    const messages = model('Message', ['id', 'senderId', 'recipientId']);
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
    const users = model('User', ['id']);
    const tasks = model('Task', ['id', 'owner', 'user']);
    addRelations([
      { source: tasks, field: 'owner', target: users, reference: 'id' },
    ]);

    expect(tasks.relations[0].property).toBe('user2');
  });
});
