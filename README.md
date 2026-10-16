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

Give the module a connection string. On start the adapter for its protocol reads the tables or collections, and the module serves a GraphQL API with one `create<Model>` mutation per table or collection.

```ts
@Module({
  imports: [InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })],
})
export class AppModule {}
```

### Adapters

Each adapter handles one kind of database. Install the driver of the one you use:

| Adapter | URL protocols | Driver | How the model is read |
|---|---|---|---|
| `postgresAdapter` | `postgres://`, `postgresql://` | `pg` | Tables, through TypeORM |
| `mysqlAdapter` | `mysql://` | `mysql2` | Tables, through TypeORM |
| `mariadbAdapter` | `mariadb://` | `mysql2` | Tables, through TypeORM |
| `mongodbAdapter` | `mongodb://`, `mongodb+srv://` | `mongodb` | Collections, inferred from a sample of 100 documents each |

A MongoDB collection has no schema, so `_id` is exposed as `id: ID!` and every other field is optional; a field whose values have different types is `JSON`.

To support another database, or to replace a built-in adapter, implement `DatabaseAdapter` and pass it in `adapters`; those are tried before the built-in ones. A SQL database that TypeORM supports only needs `createSqlAdapter`:

```ts
const sqlServerAdapter = createSqlAdapter({
  name: 'mssql',
  protocols: ['mssql'],
  type: 'mssql',
  systemSchemas: ['sys', 'INFORMATION_SCHEMA'],
  fieldTypes: { int: 'Int', bit: 'Boolean', datetime2: 'DateTime' },
});

InverseModelModule.forRoot({ url, adapters: [sqlServerAdapter] });
```

Or let the CLI write that starter project:

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

| Path | Package | What it does |
|---|---|---|
| `packages/inverse-model` | `@nestjs-modules/inverse-model` | The library: reads the database with TypeORM and mounts the GraphQL API |
| `apps/cli` | `@nestjs-modules/inverse` | `inverse` command that writes a starter project using the library |
| `packages/generator` | `@nestjs-modules/inverse-generator` | Files of that starter project |
| `samples/blog` | | Small schema to try it against |

### License

MIT
