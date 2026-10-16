<p align="center">
  <a href="http://nestjs.com/" target="blank">
    <img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" />
  </a>
</p>

<p align="center">
  We are focus on understanding the connection string to the database and generating a startup project. <a href="">Inverse Model</a> library
</p>

<p align="center">
  <a href="https://www.npmjs.com/org/nestjs-modules"><img src="https://img.shields.io/npm/v/@nestjs-modules/inverse.svg" alt="NPM Version" /></a>
  <a href="https://www.npmjs.com/org/nestjs-modules"><img src="https://img.shields.io/npm/l/@nestjs-modules/inverse.svg" alt="Package License" /></a>
  <a href="https://www.npmjs.com/org/nestjs-modules"><img src="https://img.shields.io/npm/dm/@nestjs-modules/inverse.svg" alt="NPM Downloads" /></a>
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
  authors(where: AuthorsWhere, orderBy: [AuthorsOrderBy!], limit: Int, offset: Int): [Authors!]!
  authorsCount(where: AuthorsWhere): Int!
  authorsByPk(id: Int!): Authors
  blogPosts(where: BlogPostsWhere, orderBy: [BlogPostsOrderBy!], limit: Int, offset: Int): [BlogPosts!]!
  # …
}

type Mutation {
  createAuthors(input: CreateAuthorsInput!): Authors!
  updateAuthors(id: Int!, input: UpdateAuthorsInput!): Authors
  deleteAuthors(id: Int!): Authors
  # … the same for BlogPosts
}

type Authors {
  id: Int!
  fullName: String!
  email: String!
  createdAt: DateTime!
  blogPosts(where: BlogPostsWhere, orderBy: [BlogPostsOrderBy!], limit: Int, offset: Int): [BlogPosts!]!
}

type BlogPosts {
  id: String!
  authorId: Int!
  author: Authors
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
}
```

- **Names.** Types are the table names in PascalCase (`blog_posts` → `BlogPosts`), and fields are the column names in camelCase (`created_at` → `createdAt`).
- **Filters.** Each field takes `eq`, `ne` and `isNull`. Numbers and dates add `gt`, `gte`, `lt`, `lte` and `in`, and strings add `in` and a case-insensitive `contains`. Conditions combine with `AND`, `OR` and `NOT`.
- **Pagination.** `limit` and `offset`. Without `orderBy`, lists are sorted by primary key so pages are stable.
- **Relations.** Each single-column foreign key gives a field on both sides: `BlogPosts.author` and `Authors.blogPosts`. Lookups are batched per request, so a list of 100 posts with their authors takes two queries.
- **Keys.** Tables without a primary key are only listed and created: they get no `ByPk`, `update` or `delete`.
- **Types.** `bigint` and `numeric` columns are `String` so they keep their precision. MySQL `tinyint(1)` columns are `Boolean`, `json` and `jsonb` are `JSON`, and dates are `DateTime` in ISO 8601.
- **MongoDB.** A collection has no schema, so its fields are inferred from a sample of 100 documents. `_id` becomes `id: ID!` and every other field is optional, and a field whose values have different types is `JSON`. An ID field named `author_id` or `authorId` is read as a reference to the `authors` collection.

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
| `pagination.maxLimit` | `1000` | Largest `limit` accepted; larger values are clamped. |
| `graphql` | | Apollo options other than the schema. |

The generated API reads and writes every table it finds. Put it behind your own authentication, for example a guard on the GraphQL route, and connect with a database user that only has the rights the API should have.

Or let the CLI write a starter project:

```sh
npm install -g @nestjs-modules/inverse
inverse generate postgres://user:pass@localhost:5432/blog -o blog-api
```

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
MONGODB_URL=mongodb://localhost:27017/inverse_blog \
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

### License

MIT
