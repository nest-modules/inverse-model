import 'reflect-metadata';
import * as http from 'node:http';
import { type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import type { DatabaseRecord } from '../adapters/database-adapter.interface';
import { extendSchema, mergeResolvers } from '../extend/extend-schema';
import type { InverseModelOptions } from '../inverse-model.interfaces';
import { InverseModelModule } from '../inverse-model.module';
import { blogModels, memoryDatabase } from './support/memory-database';

// The module opens whatever connection the adapter gives it; here, one in memory.
let mockDatabase: ReturnType<typeof memoryDatabase>;
jest.mock('../adapters/find-adapter', () => ({
  findAdapter: () => ({ connect: async () => mockDatabase.connection }),
}));

/** A Nest resolver class in the same app, schema-first like the generated API. */
@Resolver('Authors')
class AuthorsResolver {
  @ResolveField('initials')
  initials(@Parent() author: DatabaseRecord) {
    return String(author.name)
      .split(' ')
      .map((word) => word[0])
      .join('');
  }

  @Query('greeting')
  greeting(@Args('name') name: string) {
    return `Hello, ${name}`;
  }
}

async function start(options: Partial<InverseModelOptions>) {
  @Module({
    imports: [
      InverseModelModule.forRoot({
        url: 'memory://blog',
        graphql: {
          context: ({ req }: { req: { headers: Record<string, string> } }) => ({
            user: req.headers['x-user'],
          }),
        },
        ...options,
      }),
    ],
    providers: [AuthorsResolver],
  })
  class AppModule {}

  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  return app;
}

describe('extending the generated API', () => {
  let app: INestApplication | undefined;

  beforeEach(() => {
    mockDatabase = memoryDatabase(blogModels());
  });
  afterEach(() => app?.close());

  /** POSTs a query without keep-alive, so no socket outlives the app. */
  async function run(query: string, user = 'ada') {
    const url = new URL('/graphql', await app?.getUrl());
    const body = await new Promise<string>((resolve, reject) => {
      const request = http.request(
        url,
        {
          method: 'POST',
          agent: false,
          headers: { 'content-type': 'application/json', 'x-user': user },
        },
        (response) => {
          let text = '';
          response.on('data', (chunk) => {
            text += chunk;
          });
          response.on('end', () => resolve(text));
        },
      );
      request.on('error', reject);
      request.end(JSON.stringify({ query }));
    });
    return JSON.parse(body) as {
      data?: Record<string, unknown>;
      errors?: { message: string }[];
    };
  }

  it('serves added fields, queries and mutations next to Nest resolvers, with renames and hooks', async () => {
    app = await start({
      rename: { fields: { 'authors.full_name': 'name' } },
      extend: {
        typeDefs: `
          extend type Authors {
            displayName: String!
            initials: String!
          }
          extend type Query {
            greeting(name: String!): String!
            authorsNamed(name: String!): [Authors!]!
          }
          extend type Mutation {
            signUp(input: CreateAuthorsInput!): Authors!
          }
        `,
        resolvers: ({ connection, model, writes }) => ({
          Authors: {
            displayName: (author: DatabaseRecord) =>
              `${author.name} (#${author.id})`,
          },
          Query: {
            authorsNamed: (_: unknown, args: { name: string }) =>
              connection.find(model('authors'), {
                where: { name: { eq: args.name } },
              }),
          },
          Mutation: {
            signUp: (
              _: unknown,
              args: { input: DatabaseRecord },
              context: unknown,
            ) => writes.create(model('Authors'), args.input, context),
          },
        }),
      },
      hooks: {
        authors: {
          beforeCreate: ({ input, context }) => ({
            ...input,
            name: `${input.name} by ${context.user}`,
          }),
        },
        blog_posts: {
          beforeCreate: ({ context }) => {
            if (context.user !== 'ada')
              throw new GraphQLError('Only Ada posts');
          },
        },
      },
    });

    await expect(
      run(`mutation {
        createAuthors(input: { name: "Alan" }) { id name displayName initials }
        signUp(input: { name: "Grace" }) { name }
      }`),
    ).resolves.toEqual({
      data: {
        createAuthors: {
          id: 1,
          name: 'Alan by ada',
          displayName: 'Alan by ada (#1)',
          initials: 'Aba',
        },
        signUp: { name: 'Grace by ada' },
      },
    });
    await expect(
      run(`{
        greeting(name: "you")
        authorsNamed(name: "Alan by ada") { id blogPosts { id } }
        authors { name }
      }`),
    ).resolves.toEqual({
      data: {
        greeting: 'Hello, you',
        authorsNamed: [{ id: 1, blogPosts: [] }],
        authors: [{ name: 'Alan by ada' }, { name: 'Grace by ada' }],
      },
    });

    const refused = await run(
      'mutation { createBlogPosts(input: { authorId: 1, title: "x" }) { id } }',
      'alan',
    );
    expect(refused.errors?.[0].message).toBe('Only Ada posts');
    expect(mockDatabase.rows('blog_posts')).toEqual([]);
  });

  it('keeps generated resolvers of a type that a Nest resolver class also resolves', async () => {
    app = await start({
      extend: {
        typeDefs: [
          'extend type Authors { initials: String! }',
          'extend type Query { greeting(name: String!): String! }',
        ],
      },
      rename: { fields: { 'authors.full_name': 'name' } },
    });
    await run(
      'mutation { createAuthors(input: { name: "Ada Lovelace" }) { id } }',
    );
    await run(
      'mutation { createBlogPosts(input: { authorId: 1, title: "Notes" }) { id } }',
    );

    await expect(
      run('{ authors { initials blogPosts { title author { name } } } }'),
    ).resolves.toEqual({
      data: {
        authors: [
          {
            initials: 'AL',
            blogPosts: [{ title: 'Notes', author: { name: 'Ada Lovelace' } }],
          },
        ],
      },
    });
  });
});

describe('extendSchema', () => {
  it('appends the SDL and merges resolvers type by type', () => {
    const generated = () => 'generated';
    const scalar = { name: 'DateTime' };
    const schema = extendSchema(
      {
        typeDefs: 'type Query { a: Int }',
        resolvers: { Query: { a: generated, b: generated }, DateTime: scalar },
      },
      {
        typeDefs: [
          'extend type Query { b: Int }',
          'extend type Query { c: Int }',
        ],
        resolvers: { Query: { b: () => 'mine' } },
      },
      {} as never,
    );

    expect(schema.typeDefs).toBe(
      'type Query { a: Int }\n\nextend type Query { b: Int }\n\nextend type Query { c: Int }',
    );
    const query = schema.resolvers.Query as Record<string, () => string>;
    expect(query.a()).toBe('generated');
    expect(query.b()).toBe('mine');
    expect(schema.resolvers.DateTime).toBe(scalar);
  });

  it('replaces values that are not plain resolver maps', () => {
    class Scalar {}
    const replacement = new Scalar();
    expect(
      mergeResolvers({ DateTime: { serialize: 1 } }, [
        { DateTime: replacement },
      ]),
    ).toEqual({ DateTime: replacement });
  });
});
