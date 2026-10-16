import type { DatabaseConnection } from '../adapters/database-adapter.interface';
import { createSchema } from '../graphql/create-schema';

// @nestjs/graphql ships ESM, which jest cannot load; the scalar is not under test.
jest.mock('@nestjs/graphql', () => ({ GraphQLISODateTime: {} }));

describe('createSchema', () => {
  const connection: DatabaseConnection = {
    models: [
      {
        name: 'Posts',
        fields: [
          {
            name: 'id',
            property: 'id',
            type: 'Int',
            isArray: false,
            isNullable: false,
            hasDefault: true,
          },
          {
            name: 'title',
            property: 'title',
            type: 'String',
            isArray: false,
            isNullable: false,
            hasDefault: false,
          },
          {
            name: 'tags',
            property: 'tags',
            type: 'String',
            isArray: true,
            isNullable: true,
            hasDefault: false,
          },
        ],
      },
    ],
    insert: jest.fn(async (_model, input) => ({ id: 1, ...input })),
    close: jest.fn(),
  };
  const { typeDefs, resolvers } = createSchema(connection);

  it('types the fields as the adapter reports them', () => {
    expect(typeDefs).toContain(
      'type Posts {\n  id: Int!\n  title: String!\n  tags: [String]\n}',
    );
  });

  it('only requires fields the database does not fill in on create', () => {
    expect(typeDefs).toContain(
      'input CreatePostsInput {\n  id: Int\n  title: String!\n  tags: [String]\n}',
    );
  });

  it('inserts through the connection', async () => {
    type Resolver = (parent: unknown, args: unknown) => Promise<unknown>;
    const mutation = (resolvers as Record<string, Record<string, Resolver>>)
      .Mutation;
    await expect(
      mutation.createPosts(undefined, { input: { title: 'Hello' } }),
    ).resolves.toEqual({ id: 1, title: 'Hello' });
    expect(connection.insert).toHaveBeenCalledWith(connection.models[0], {
      title: 'Hello',
    });
  });
});
