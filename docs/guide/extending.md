# Extending the API

## Hooks

Hooks run code around the generated writes, per table or collection name, or `*` for all of them:

```ts
import { GraphQLError } from 'graphql';

InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  hooks: {
    blog_posts: {
      beforeCreate: ({ input, context }) => {
        if (!context.req.user) throw new GraphQLError('Sign in to post');
        return { ...input, slug: slugify(input.title) }; // written instead of the input
      },
    },
    '*': {
      afterUpdate: ({ model, key, transaction }) =>
        transaction.manager?.query('INSERT INTO audit_log (message) VALUES ($1)', [
          `${model.source} ${JSON.stringify(key)} updated`,
        ]),
    },
  },
  graphql: { context: ({ req }) => ({ req }) },
});
```

The hooks are `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete` and `afterDelete`. Each one gets `{ model, input, key, record, context, transaction }`.

- Records and inputs use the API's field names.
- A before-hook may return a new input to write instead; throwing aborts the write with that error.
- For each step, the `*` hooks run first, then the table's.
- Updates and deletes of a missing record run no hooks.
- Batch mutations run the hooks for each row.

## Transactions

A write runs with its hooks in one transaction: if an after-hook throws, the write rolls back.

- Queries through `transaction.connection` are part of the transaction.
- So are raw queries through `transaction.manager`, which is TypeORM's `EntityManager` on SQL databases, or MongoDB calls passed `{ session: transaction.session }`.
- Cached results are cleared once the transaction is over, never before it commits.

MongoDB needs a replica set or a sharded cluster for transactions; a single-node replica set is enough. On a standalone server the hooks still run, but `transaction.active` is `false` and each write applies on its own, so nothing rolls back.

## Your own types and resolvers

`extend` merges your SDL and resolvers into the generated schema. Use `extend type` on generated types, `Query` and `Mutation`, and the generated types and inputs:

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  extend: {
    typeDefs: `
      extend type Author { displayName: String! }
      extend type Mutation { signUp(input: CreateAuthorInput!): Author! }
    `,
    resolvers: ({ connection, model, writes }) => ({
      Author: { displayName: (author) => `${author.fullName} <${author.email}>` },
      Mutation: {
        signUp: (_, { input }, context) => writes.create(model('authors'), input, context),
      },
    }),
  },
});
```

`resolvers` may be an object or a function of `{ connection, model, writes }`:

- `connection` reads and writes the database, with the same scope and restrictions as the API.
- `model(name)` finds a table or collection by name.
- `writes` runs creates, updates and deletes with their hooks and transaction.

## Nest resolvers

Nest resolvers in the same app work schema-first: declare their fields in `extend.typeDefs`, and use `@Resolver('Author')`, `@ResolveField()`, `@Query()` and `@Mutation()` with those names. They merge with the generated resolvers field by field, and win where both resolve the same field.

Code-first (`autoSchemaFile`, `@ObjectType()`) builds a schema of its own and can't be combined with the generated one.

## Renames

`rename` gives tables and columns other names in the API. Relations follow the new names:

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  rename: {
    tables: { blog_posts: 'Article' },
    fields: { 'authors.full_name': 'name', 'blog_posts.author_id': 'writerId' },
  },
});
```

With these, `Article.writer` points at the author and `Author.articles` back at the posts. For rules that apply to every name, use [`naming`](./naming).
