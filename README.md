<p align="center">
  <a href="https://nestjs.com/" target="blank">
    <img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/nest-modules/inverse-model">Inverse Model</a> mounts a GraphQL API over an existing database from just its connection string.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nestjs-modules/inverse-model"><img src="https://img.shields.io/npm/v/@nestjs-modules/inverse-model" alt="npm" /></a>
  <a href="https://github.com/nest-modules/inverse-model/actions/workflows/ci.yml"><img src="https://github.com/nest-modules/inverse-model/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/nest-modules/inverse-model/blob/main/LICENSE"><img src="https://img.shields.io/github/license/nest-modules/inverse-model" alt="License" /></a>
</p>

<p align="center">
  <a href="https://nest-modules.github.io/inverse-model/"><strong>Documentation</strong></a> ·
  <a href="https://nest-modules.github.io/inverse-model/es/"><strong>Documentación en español</strong></a>
</p>

## Install

```sh
npm install @nestjs-modules/inverse-model
```

Plus the driver of your database: `pg`, `mysql2`, `mssql` or `mongodb`. See [Getting started](https://nest-modules.github.io/inverse-model/guide/getting-started) for the peer dependencies.

## Usage

```ts
import { Module } from '@nestjs/common';
import { InverseModelModule } from '@nestjs-modules/inverse-model';

@Module({
  imports: [InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })],
})
export class AppModule {}
```

On start it reads every table, key and foreign key of the database, and serves a GraphQL API with filters, pagination, relations and every mutation, for PostgreSQL, MySQL, MariaDB, SQL Server and MongoDB.

Everything else is in the [documentation](https://nest-modules.github.io/inverse-model/): the [generated API](https://nest-modules.github.io/inverse-model/guide/generated-api), [security](https://nest-modules.github.io/inverse-model/guide/security), [caching](https://nest-modules.github.io/inverse-model/guide/caching), [extending](https://nest-modules.github.io/inverse-model/guide/extending) and all the [options](https://nest-modules.github.io/inverse-model/reference/options).

## Contributing

See [Contributing](https://nest-modules.github.io/inverse-model/reference/contributing).

## License

[MIT](https://github.com/nest-modules/inverse-model/blob/main/LICENSE)
