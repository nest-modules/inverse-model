# Primeros pasos

Esta guía lleva una app NestJS desde cero hasta una API GraphQL sobre una base de datos PostgreSQL. Los mismos pasos sirven para cualquier [base de datos soportada](/es/databases/): solo cambian el driver y la URL.

## Requisitos

- Node.js 24 o posterior
- NestJS 12 con `@nestjs/graphql` 14 y Apollo Server 5
- Una base de datos a la que te puedas conectar

## 1. Instala

Instala la librería, sus dependencias peer y el driver de tu base de datos:

```sh
npm install @nestjs-modules/inverse-model \
  @nestjs/graphql @nestjs/apollo @apollo/server @as-integrations/express5 graphql \
  typeorm pg
```

| Base de datos | Paquete del driver |
|---|---|
| PostgreSQL | `pg` |
| MySQL, MariaDB | `mysql2` |
| SQL Server | `mssql` |
| MongoDB | `mongodb` |

TypeORM lee las bases de datos SQL. Es una dependencia peer del módulo, así que instálalo también con MongoDB.

## 2. Importa el módulo

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

## 3. Arráncalo

```sh
DATABASE_URL=postgres://user:pass@localhost:5432/blog node dist/main.js
```

Al arrancar, el log dice cuántas tablas leyó. La API se sirve en `http://localhost:3000/graphql`.

## 4. Consúltalo

Para una base de datos con `authors` y `blog_posts`, donde `blog_posts.author_id` referencia a `authors.id`:

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

## Pruébalo con la base de datos de ejemplo

El repositorio incluye un schema de blog para cada base de datos y un archivo de Docker Compose que lo carga:

```sh
git clone https://github.com/nest-modules/inverse-model.git
cd inverse-model
docker compose up -d --wait postgres
DATABASE_URL=postgres://inverse:inverse@postgres:5432/inverse_blog docker compose up -d --build --wait app
```

La API queda entonces en `http://localhost:3000/graphql`.

## O empieza desde la CLI

La CLI escribe un proyecto listo para ejecutar alrededor del módulo:

```sh
npm install -g @nestjs-modules/inverse
inverse generate postgres://user:pass@localhost:5432/blog -o blog-api
```

Consulta [CLI](./cli).

## Siguientes pasos

- [La API generada](./generated-api): cada query y mutation que obtienes.
- [Seguridad](./security): acota la API antes de que llegue a producción.
- [Opciones](/es/reference/options): todo lo que acepta `forRoot`.
