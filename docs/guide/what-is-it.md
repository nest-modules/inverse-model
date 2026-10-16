# What is Inverse Model?

Inverse Model is a NestJS module that turns an existing database into a GraphQL API. You give it a connection string; on start it reads every table or collection, with its columns, keys and foreign keys, and serves a GraphQL schema to read and write all of them.

```ts
@Module({
  imports: [InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })],
})
export class AppModule {}
```

It is *database-first*: the database is the source of truth, and the API follows it. There are no entities, DTOs or resolvers to write, and nothing is ever migrated or synchronized: the library only reads the schema.

## When to use it

- **Internal tools and admin panels** that need to read and edit data that already exists.
- **Modernizing a legacy database** behind a typed API without rewriting it.
- **Prototypes** that need a working backend in minutes.
- **A data API inside an existing NestJS app**, next to your own modules, guards and resolvers.

## What it generates

For every table or collection:

| | |
|---|---|
| **Queries** | A list with filters, ordering and `limit`/`offset`, a count, a lookup by primary key, and a Relay-style connection with cursors. |
| **Mutations** | Create, update, delete, upsert, and batch create and delete. |
| **Relations** | A field on both sides of every foreign key, composite keys included, batched per request. |

See [The generated API](./generated-api) for the full shape.

## How it compares

Tools like Hasura or PostGraphile run as a separate server with their own configuration format. Inverse Model is a library that runs inside your NestJS process, configured in TypeScript in `forRoot`, so it shares your app's lifecycle, dependency injection, logging and deployment. It also covers databases those tools support partially or not at all, such as SQL Server and MongoDB.

## Supported databases

| Database | URL | Driver |
|---|---|---|
| PostgreSQL | `postgres://user:pass@host:5432/db` | `pg` |
| MySQL | `mysql://user:pass@host:3306/db` | `mysql2` |
| MariaDB | `mariadb://user:pass@host:3306/db` | `mysql2` |
| SQL Server | `mssql://user:pass@host:1433/db` | `mssql` |
| MongoDB | `mongodb://host:27017/db` or `mongodb+srv://…` | `mongodb` |

Every database is tested in CI on every change, both directly and through the full GraphQL API in Docker. See [Databases](/databases/) for what differs between them.
