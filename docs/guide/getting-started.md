# Getting started

This guide takes a NestJS app from nothing to a GraphQL API over a PostgreSQL database. The same steps work for any [supported database](/databases/): only the driver and the URL change.

## Requirements

- Node.js 24 or later
- NestJS 12 with `@nestjs/graphql` 14 and Apollo Server 5
- A database you can connect to

## 1. Install

Install the library, its peer dependencies, and the driver of your database:

```sh
npm install @nestjs-modules/inverse-model \
  @nestjs/graphql @nestjs/apollo @apollo/server @as-integrations/express5 graphql \
  typeorm pg
```

| Database | Driver package |
|---|---|
| PostgreSQL | `pg` |
| MySQL, MariaDB | `mysql2` |
| SQL Server | `mssql` |
| MongoDB | `mongodb` |

TypeORM reads the SQL databases. It is a peer dependency of the module, so install it with MongoDB too.

## 2. Import the module

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { InverseModelModule } from '@nestjs-modules/inverse-model';

@Module({
  imports: [InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })],
})
export class AppModule {}
```

```ts
// main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

bootstrap();
```

## 3. Start it

```sh
DATABASE_URL=postgres://user:pass@localhost:5432/blog node dist/main.js
```

On start the log says how many tables it read. The API is served at `http://localhost:3000/graphql`.

## 4. Query it

For a database with `authors` and `blog_posts`, where `blog_posts.author_id` references `authors.id`:

```graphql
{
  blogPosts(where: { title: { contains: "graphql" } }, orderBy: [{ id: DESC }], limit: 5) {
    title
    author { fullName }
  }
  authorsCount
}
```

```graphql
mutation {
  createAuthor(input: { fullName: "Ada Lovelace", email: "ada@example.com" }) {
    id
    createdAt
  }
}
```

## Try it with the sample database

The repository ships a blog schema for every database and a Docker Compose file that loads it:

```sh
git clone https://github.com/nest-modules/inverse-model.git
cd inverse-model
docker compose up -d --wait postgres
DATABASE_URL=postgres://inverse:inverse@postgres:5432/inverse_blog docker compose up -d --build --wait app
```

The API is then at `http://localhost:3000/graphql`.

## Or start from the CLI

The CLI writes a ready-to-run project around the module:

```sh
npm install -g @nestjs-modules/inverse
inverse generate postgres://user:pass@localhost:5432/blog -o blog-api
```

See [CLI](./cli).

## Next steps

- [The generated API](./generated-api): every query and mutation you get.
- [Security](./security): narrow the API down before it reaches production.
- [Options](/reference/options): everything `forRoot` accepts.
