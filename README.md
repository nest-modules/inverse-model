<p align="center">
  <a href="https://nestjs.com/" target="blank">
    <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/nest-modules/inverse-model">Inverse Model</a> mounts a GraphQL API over an existing database from just its connection string.
</p>

<p align="center">
  <a href="https://nest-modules.github.io/inverse-model/"><strong>Documentation</strong></a>
</p>

<p align="center">
  <a href="https://github.com/nest-modules/inverse-model/actions/workflows/ci.yml"><img src="https://github.com/nest-modules/inverse-model/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/nest-modules/inverse-model" alt="License" /></a>
</p>

### Usage

Give the module a connection string. On start it reads every table or collection of the database, with its keys and foreign keys, and serves a GraphQL API to read and write all of them. There is nothing else to write.

```ts
@Module({
  imports: [InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })],
})
export class AppModule {}
```

Install the driver of your database next to the library:

| Database | URL | Driver |
|---|---|---|
| PostgreSQL | `postgres://user:pass@host:5432/db` | `pg` |
| MySQL | `mysql://user:pass@host:3306/db` | `mysql2` |
| MariaDB | `mariadb://user:pass@host:3306/db` | `mysql2` |
| SQL Server | `mssql://user:pass@host:1433/db` | `mssql` |
| MongoDB | `mongodb://host:27017/db` or `mongodb+srv://…` | `mongodb` |

### Generated API

For a database with `authors` and `blog_posts`, where `blog_posts.author_id` references `authors.id`:

```graphql
type Query {
  authors(where: AuthorWhere, orderBy: [AuthorOrderBy!], limit: Int, offset: Int): [Author!]!
  authorsCount(where: AuthorWhere): Int!
  author(id: Int!): Author
  authorsConnection(where: AuthorWhere, orderBy: [AuthorOrderBy!], first: Int, after: String, last: Int, before: String): AuthorConnection!
  blogPosts(where: BlogPostWhere, orderBy: [BlogPostOrderBy!], limit: Int, offset: Int): [BlogPost!]!
  blogPostsCount(where: BlogPostWhere): Int!
  blogPost(id: String!): BlogPost
  blogPostsConnection(…): BlogPostConnection!
}

type Mutation {
  createAuthor(input: CreateAuthorInput!): Author!
  updateAuthor(id: Int!, input: UpdateAuthorInput!): Author
  deleteAuthor(id: Int!): Author
  upsertAuthor(input: CreateAuthorInput!): Author!
  createManyAuthors(inputs: [CreateAuthorInput!]!): Int!
  deleteManyAuthors(where: AuthorWhere!): Int!
  # … the same for BlogPost
}

type Author {
  id: Int!
  fullName: String!
  email: String!
  createdAt: DateTime!
  blogPosts(where: BlogPostWhere, orderBy: [BlogPostOrderBy!], limit: Int, offset: Int): [BlogPost!]!
}

type BlogPost {
  id: String!
  authorId: Int!
  author: Author
  # …
}
```

```graphql
{
  blogPosts(
    where: { title: { contains: "graphql" }, OR: [{ published: { eq: true } }, { rating: { gte: 4 } }] }
    orderBy: [{ rating: DESC }]
    limit: 10
  ) {
    title
    author { fullName }
  }
  authorsConnection(first: 20, where: { blogPosts: { some: { published: { eq: true } } } }) {
    edges { cursor node { fullName } }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}
```

- **Names.** Types are the table names in singular PascalCase (`blog_posts` → `BlogPost`, `people` → `Person`), and fields are the column names in camelCase (`created_at` → `createdAt`). Lists, counts and connections take the plural (`blogPosts`, `blogPostsCount`, `blogPostsConnection`, `createManyBlogPosts`), the by-key query and the other mutations the singular (`blogPost(id:)`, `createBlogPost`, `upsertBlogPost`). A word with the same singular and plural, like `news`, gets `newsByPk` for its by-key query. The schema of a table is left out of its name; the `naming` option changes any of this.
- **Name checks.** If two tables end up with the same name (`public.users` and `audit.users` are both `User`), a name clashes with one the API already uses (`Query`, `Int`, `DateTime`, `StringFilter`, `PageInfo`…), or a name is not valid in GraphQL (`1st_quarter`), the app fails to start with an error that lists the tables involved.
- **Filters.** Each field takes `eq`, `ne` and `isNull`. Numbers and dates add `gt`, `gte`, `lt`, `lte` and `in`, and strings add `in` and a case-insensitive `contains`. Conditions combine with `AND`, `OR` and `NOT`. Relations filter too: `author: { fullName: { contains: "ada" } }`, and `blogPosts: { some | none | every: { … } }` (EXISTS subqueries on SQL; on MongoDB the related ids are read first).
- **Pagination.** `limit` and `offset`. Without `orderBy`, lists are sorted by primary key so pages are stable. Tables with a primary key also get a Relay-style `…Connection` with `first`/`after` and `last`/`before`, whose opaque cursors hold the order-by values plus the primary key.
- **Batches.** `upsert…` updates the row with the input's primary key or creates it. `createMany…` and `deleteMany…` return a count and refuse more than `pagination.maxLimit` rows. Hooks run for each row, all in one transaction.
- **Relations.** Each foreign key, composite ones included, gives a field on both sides: `BlogPost.author` and `Author.blogPosts`. Lookups are batched per request, so a list of 100 posts with their authors takes two queries.
- **Keys.** Tables without a primary key are only listed and created: they get no by-key query, `update`, `delete`, `upsert`, `deleteMany` or connection. Tables whose columns are all key, like join tables, get no `update`.
- **Views.** SQL views are read-only: listed, counted, filtered and followed, never written. Declare their keys with the `views` option to give them a by-key query, a connection and relations.
- **Types.** `bigint` and `numeric` columns are `String` so they keep their precision. MySQL `tinyint(1)` columns are `Boolean`, `json` and `jsonb` are `JSON`, and dates are `DateTime` in ISO 8601.
- **MongoDB.** A collection has no schema, so its fields are inferred from a sample of 100 documents. `_id` becomes `id: ID!` and every other field is optional, and a field whose values have different types is `JSON`. An ID field named `author_id` or `authorId` is read as a reference to the `author` or `authors` collection, and `category_id` to `categories`; a DBRef to the collection it names; and an array of ids named `tag_ids` or `tagIds` as a list of `tags`.

### Options

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  // TLS for the database connection; `true` uses the driver's defaults.
  ssl: { rejectUnauthorized: true, ca: process.env.DB_CA_CERT },
  // Caches query results in Redis (needs `ioredis`). A mutation on a table clears that table's results.
  cache: {
    url: process.env.REDIS_URL!,
    ttl: 60, // seconds
    ttlByTable: { audit_logs: 0, countries: 3600 }, // 0 leaves a table uncached
  },
  pagination: { defaultLimit: 100, maxLimit: 1000 },
  // How tables and columns are named in the API; each function left out keeps the default.
  naming: {
    type: (table) => (table === 'audit.users' ? 'AuditUser' : defaultNaming.type(table)),
    field: (column, table) => defaultNaming.field(column, table),
    plural: (type) => defaultNaming.plural(type),
  },
  // Keys of SQL views, which have none of their own.
  views: {
    published_posts: {
      primaryKey: ['id'],
      foreignKeys: [{ columns: ['author_id'], table: 'authors', references: ['id'] }],
    },
  },
  // Anything else Apollo accepts, e.g. introspection, which is off when NODE_ENV=production.
  graphql: { introspection: true },
});
```

| Option | Default | What it does |
|---|---|---|
| `url` | (required) | Connection string; its protocol picks the database. Driver parameters in the URL (e.g. `?sslmode=require` for PostgreSQL, `?trustServerCertificate=true` for SQL Server) are honored. |
| `ssl` | driver default | `true`, or `{ rejectUnauthorized, ca, cert, key }` with PEM contents. |
| `cache.url` | (no cache) | Redis connection string. If Redis is unreachable, queries go to the database and a warning is logged. |
| `cache.ttl` | `60` | Seconds a result is kept. |
| `cache.ttlByTable` | `{}` | TTL per table or collection name. |
| `cache.keyPrefix` | `inverse:` | Prefix of every Redis key. |
| `pagination.defaultLimit` | `100` | Rows a list returns without `limit`. |
| `pagination.maxLimit` | `1000` | Largest `limit` accepted; larger values are clamped. Also caps `createMany…` and `deleteMany…`. |
| `naming.type` | singular PascalCase | Type name of a table or collection, given its name as listed: schema-qualified where the database has schemas (`public.blog_posts`). |
| `naming.field` | camelCase | API name of a column or document field, given the column and its table. |
| `naming.plural` | English plural | Plural of a type name, used for lists, counts and to-many relations. |
| `views` | `{}` | Per view name: `primaryKey` and `foreignKeys` (column names). |
| `graphql` | | Apollo options other than the schema. |
| `hooks` | | Code run around the generated writes; see [Extending the API](#extending-the-api). |
| `extend` | | SDL and resolvers merged into the generated schema. |
| `rename` | | Other API names for tables and columns. |

`defaultNaming` and the `singularize` and `pluralize` it uses are exported, so an override can build on them.

#### Options from ConfigService

`forRootAsync` takes the options from a factory, so they can come from `@nestjs/config` or any other provider:

```ts
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InverseModelModule } from '@nestjs-modules/inverse-model';

@Module({
  imports: [
    ConfigModule.forRoot(),
    InverseModelModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        url: config.getOrThrow('DATABASE_URL'),
        cache: config.get('REDIS_URL') ? { url: config.get('REDIS_URL') } : undefined,
      }),
    }),
  ],
})
export class AppModule {}
```

`useClass` and `useExisting` work too, with a class whose `createInverseModelOptions()` returns the options. The options are also injectable through the `INVERSE_MODEL_OPTIONS` token.

#### Security

By default the API reads and writes every table it finds. These options narrow it down:

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  include: ['authors', 'blog_posts', 'audit_*'], // tables or `table.column`; everything when left out
  exclude: ['*.password_hash', 'authors.email'], // wins over include
  readOnly: ['audit_*'], // or `true` for the whole API
  queryLimits: { maxDepth: 10, maxComplexity: 50000 },
  authorize: ({ operation, context }) =>
    operation === 'list' || context.req.user?.isAdmin === true,
  scope: ({ type, context }) =>
    type === 'BlogPost' ? { tenantId: { eq: context.req.user.tenantId } } : null,
});
```

| Option | Default | What it does |
|---|---|---|
| `include` / `exclude` | everything | Table or collection names (bare or schema-qualified, e.g. `public.users`) and `table.column` names; `*` matches any name. Hidden fields leave the types, inputs, filters and ordering, and hidden tables take their relations with them. |
| `readOnly` | `false` | `true`, or the tables that get no create, update, delete, upsert or batch mutations. With nothing writable there is no `Mutation` type. |
| `queryLimits.maxDepth` | `10` | Deepest nesting of fields a query may have. Introspection is not counted. |
| `queryLimits.maxComplexity` | `50000` | Largest cost of a query: each field costs 1, times the rows of the lists it is in (their `limit`, or `pagination.defaultLimit`). |
| `authorize` | allow all | `({ model, type, operation, context, args }) => boolean \| Promise<boolean>`, asked before every `list`, `count`, `byPk`, `create`, `update` and `delete`; relation fields and relation filters ask for `list` of the model they point at. A connection asks for `list`, an upsert for `create` and `update`, and `createMany`/`deleteMany` for `create`/`delete`. False answers a `FORBIDDEN` error. |
| `scope` | none | `({ model, type, operation, context }) => Where \| null`, ANDed into every read, update and delete of the model, relations, relation filters, connections and `deleteMany` included, and part of the cache key. An upsert of a row outside the scope answers `FORBIDDEN`. Properties are the API's (`tenantId`), not the columns'. It does not check what a create or update writes; use `authorize`, which sees `args`. |

`model` is the table or collection name (`blog_posts`; tables outside the default schema keep it, e.g. `audit.users`) and `type` its GraphQL name. Nest guards do not run on these resolvers, so `authorize` and `scope` are where access control goes; `context` is Apollo's, `{ req }` by default.

Errors from the database never reach the client: it gets `Internal server error` with an `errorId`, and the original is logged with Nest's `Logger` under that id. Validation errors, and errors thrown on purpose (a `GraphQLError` or a Nest `HttpException`), go through as they are. Passwords of the database and Redis URLs are hidden in errors and logs.

Still connect with a database user that only has the rights the API should have.

Or let the CLI write a starter project:

```sh
npm install -g @nestjs-modules/inverse
inverse generate postgres://user:pass@localhost:5432/blog -o blog-api
```

### Extending the API

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  // Other names in the API; relations follow them (`Author.articles`, `Article.writer`).
  rename: {
    tables: { blog_posts: 'Article' },
    fields: { 'authors.full_name': 'name', 'blog_posts.author_id': 'writerId' },
  },
  // Per table name, or `*` for all: beforeCreate, afterCreate, beforeUpdate, afterUpdate, beforeDelete, afterDelete.
  hooks: {
    blog_posts: {
      beforeCreate: ({ input, context }) => {
        if (!context.req.user) throw new GraphQLError('Sign in to post');
        return { ...input, slug: slugify(input.title) }; // written instead of the input
      },
    },
    '*': {
      // Part of the update's transaction: if it fails, the update rolls back.
      afterUpdate: ({ model, key, transaction }) =>
        transaction.manager?.query('INSERT INTO audit_log (message) VALUES ($1)', [
          `${model.source} ${JSON.stringify(key)} updated`,
        ]),
    },
  },
  // Your own SDL and resolvers, merged into the generated schema.
  extend: {
    typeDefs: `
      extend type Author { displayName: String! }
      extend type Mutation { signUp(input: CreateAuthorInput!): Author! }
    `,
    resolvers: ({ connection, model, writes }) => ({
      Author: { displayName: (author) => `${author.name} <${author.email}>` },
      Mutation: {
        signUp: (_, { input }, context) => writes.create(model('authors'), input, context),
      },
    }),
  },
  graphql: { context: ({ req }) => ({ req }) },
});
```

- **Hooks** get `{ model, input, key, record, context, transaction }`. Records and inputs use the API's field names. A before-hook may return a new input; throwing aborts the write with that error. For each step the `*` hooks run first, then the table's. Updates and deletes of a missing record run no hooks.
- **Transactions.** A write runs with its hooks in one transaction: an after-hook that throws rolls the write back. Queries through `transaction.connection` are part of it, and so are raw ones through `transaction.manager` (TypeORM's `EntityManager`, on SQL databases) or with `{ session: transaction.session }` (MongoDB). Cached results of a table are cleared once the transaction is over, never before it commits.
- **MongoDB** needs a replica set or a sharded cluster for transactions; a single-node replica set is enough. On a standalone server the hooks still run, but `transaction.active` is false and each write applies on its own, so nothing rolls back.
- **Extend** with `extend type` on generated types, `Query` and `Mutation`, using the generated types and inputs. `resolvers` may be a function of `{ connection, model, writes }`; `writes` runs the hooks too.
- **Nest resolvers** in the same app work schema-first: declare their fields in `extend.typeDefs` and use `@Resolver('Author')`, `@ResolveField()`, `@Query()` and `@Mutation()` with those names. They merge with the generated resolvers field by field, and win where both resolve a field. Code-first (`autoSchemaFile`, `@ObjectType()`) builds a schema of its own and cannot be combined with the generated one.

### Development

```sh
pnpm install
pnpm build
pnpm test
pnpm check
```

`compose.yaml` starts PostgreSQL, MySQL, MariaDB, SQL Server and MongoDB with the blog sample loaded, plus Redis and the sample app built from the `Dockerfile`. CI runs the same steps on every push and pull request:

```sh
docker compose up -d --wait postgres mysql mariadb sqlserver mongodb redis

# Adapter integration tests; a database without a URL is skipped
POSTGRES_URL=postgres://inverse:inverse@localhost:5432/inverse_blog \
MYSQL_URL=mysql://inverse:inverse@localhost:3306/inverse_blog \
MARIADB_URL=mariadb://inverse:inverse@localhost:3307/inverse_blog \
SQLSERVER_URL='mssql://sa:Inverse_Passw0rd@localhost:1433/inverse_blog?trustServerCertificate=true' \
MONGODB_URL='mongodb://localhost:27017/inverse_blog?directConnection=true' \
REDIS_URL=redis://localhost:6379 \
pnpm --filter @nestjs-modules/inverse-model test:integration

# The app over one of them (with the cache on), then the whole API through GraphQL
DATABASE_URL=mongodb://mongodb:27017/inverse_blog REDIS_URL=redis://redis:6379 \
docker compose up -d --build --wait app
node scripts/smoke-test.mjs
```

If a port is taken, move it with `POSTGRES_PORT`, `MYSQL_PORT`, `MARIADB_PORT`, `SQLSERVER_PORT`, `MONGODB_PORT`, `REDIS_PORT` or `APP_PORT`. The SQL Server image is only published for amd64. On Apple silicon it runs under emulation and needs Docker with Rosetta and at least 2 GB of memory.

| Path | Package | What it does |
|---|---|---|
| `packages/inverse-model` | `@nestjs-modules/inverse-model` | The library: reads the database and mounts the GraphQL API |
| `apps/cli` | `@nestjs-modules/inverse` | `inverse` command that writes a starter project using the library |
| `packages/generator` | `@nestjs-modules/inverse-generator` | Files of that starter project |
| `samples/blog` | | Small schema to try it against |

### Releasing

The three packages are versioned together with [Changesets](https://github.com/changesets/changesets). Describe a user-facing change with `pnpm changeset` and commit the file it writes. On `main`, the release workflow keeps a "Version packages" PR open that bumps the versions and fills each `CHANGELOG.md`; merging it publishes the new versions to npm with provenance and tags them. Package versions not yet on npm, such as the first `0.1.0`, are published on the next push to `main`.

Publishing needs an npm token in the `NPM_TOKEN` secret of the repository or the organization, and *Allow GitHub Actions to create and approve pull requests* turned on under Settings → Actions. Once the packages exist on npm, you can add `nest-modules/inverse-model` with workflow `release.yml` as a trusted publisher on each package's npm settings page and delete the token: `pnpm publish` tries trusted publishing (OIDC) first and only falls back to `NPM_TOKEN`.

### License

MIT
