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

```sh
npm install -g @nestjs-modules/inverse
inverse generate postgres://user:pass@localhost:5432/blog -o blog-api
cd blog-api && npm install && npm run build && npm start
```

The generated project is a NestJS GraphQL API with one `create<Table>` mutation per table.

### Development

```sh
pnpm install
pnpm build
pnpm test
pnpm check
```

| Path | Package | What it does |
|---|---|---|
| `apps/cli` | `@nestjs-modules/inverse` | `inverse` command, a NestJS app built with nest-commander |
| `packages/introspector` | `@nestjs-modules/inverse-introspector` | Reads a database into a driver-neutral `DatabaseSchema` (PostgreSQL for now) |
| `packages/generator` | `@nestjs-modules/inverse-generator` | Turns a `DatabaseSchema` into the files of the generated project |
| `samples/blog` | | Small schema to try the generator against |

### License

MIT
