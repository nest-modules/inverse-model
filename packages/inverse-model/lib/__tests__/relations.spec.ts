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
      {
        source: posts,
        fields: ['authorId'],
        target: authors,
        references: ['id'],
      },
    ]);

    expect(posts.relations).toEqual([
      {
        property: 'author',
        kind: 'one',
        target: 'Author',
        fields: ['authorId'],
        references: ['id'],
      },
    ]);
    expect(authors.relations).toEqual([
      {
        property: 'blogPosts',
        kind: 'many',
        target: 'BlogPost',
        fields: ['id'],
        references: ['authorId'],
      },
    ]);
  });

  it('names the way back with the plural the model gives', () => {
    const people = model('Person', ['id']);
    const posts = { ...model('Post', ['id', 'authorId']), plural: 'Writings' };
    addRelations([
      {
        source: posts,
        fields: ['authorId'],
        target: people,
        references: ['id'],
      },
    ]);
    expect(people.relations[0].property).toBe('writings');
  });

  it('tells apart two keys to the same table', () => {
    const users = model('User', ['id']);
    const messages = model('Message', ['id', 'senderId', 'recipientId']);
    addRelations([
      {
        source: messages,
        fields: ['senderId'],
        target: users,
        references: ['id'],
      },
      {
        source: messages,
        fields: ['recipientId'],
        target: users,
        references: ['id'],
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
      { source: tasks, fields: ['owner'], target: users, references: ['id'] },
    ]);

    expect(tasks.relations[0].property).toBe('user2');
  });

  it('relates composite keys and keys holding arrays', () => {
    const editions = model('Editions', ['bookId', 'edition']);
    const reviews = model('Reviews', ['id', 'bookId', 'edition']);
    const tags = model('Tags', ['id']);
    const notes = model('Notes', ['id', 'tagIds']);
    notes.fields[1].isArray = true;
    addRelations([
      {
        source: reviews,
        fields: ['bookId', 'edition'],
        target: editions,
        references: ['bookId', 'edition'],
      },
      { source: notes, fields: ['tagIds'], target: tags, references: ['id'] },
    ]);

    expect(reviews.relations).toEqual([
      {
        property: 'editions',
        kind: 'one',
        target: 'Editions',
        fields: ['bookId', 'edition'],
        references: ['bookId', 'edition'],
      },
    ]);
    expect(editions.relations[0]).toMatchObject({
      property: 'reviews',
      kind: 'many',
      fields: ['bookId', 'edition'],
    });
    expect(notes.relations[0]).toMatchObject({
      property: 'tags',
      kind: 'many',
    });
    expect(tags.relations[0]).toMatchObject({
      property: 'notes',
      kind: 'many',
      fields: ['id'],
      references: ['tagIds'],
    });
  });
});
