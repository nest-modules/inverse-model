# Contributing

The repository is a pnpm and Turborepo monorepo:

| Path | Package | What it is |
|---|---|---|
| `packages/inverse-model` | `@nestjs-modules/inverse-model` | The library |
| `apps/cli` | `@nestjs-modules/inverse` | The `inverse` command |
| `packages/generator` | `@nestjs-modules/inverse-generator` | The files the CLI writes |
| `samples/blog` | | A small app and schema to try the library against |
| `docs` | | This site |

## Setup

Node.js 24 and pnpm 11:

```sh
pnpm install
pnpm build
pnpm test
pnpm check
```

## Integration tests

`compose.yaml` starts every database with the blog sample loaded, plus Redis:

```sh
docker compose up -d --wait postgres mysql mariadb sqlserver mongodb redis

POSTGRES_URL=postgres://inverse:inverse@localhost:5432/inverse_blog \
MYSQL_URL=mysql://inverse:inverse@localhost:3306/inverse_blog \
MARIADB_URL=mariadb://inverse:inverse@localhost:3307/inverse_blog \
SQLSERVER_URL='mssql://sa:Inverse_Passw0rd@localhost:1433/inverse_blog?trustServerCertificate=true' \
MONGODB_URL='mongodb://localhost:27017/inverse_blog?directConnection=true' \
REDIS_URL=redis://localhost:6379 \
pnpm --filter @nestjs-modules/inverse-model test:integration
```

A database without a URL is skipped. If a port is taken, move it with `POSTGRES_PORT`, `MYSQL_PORT`, `MARIADB_PORT`, `SQLSERVER_PORT`, `MONGODB_PORT` or `REDIS_PORT`. Docker needs about 2 GB of memory for all of them at once.

## End-to-end test

The sample app runs in Docker over any of the databases, and a script exercises the whole API through GraphQL:

```sh
DATABASE_URL=postgres://inverse:inverse@postgres:5432/inverse_blog docker compose up -d --build --wait app
node scripts/smoke-test.mjs
```

## Documentation

```sh
pnpm --filter inverse-model-docs dev
```

The site is built with VitePress and published to GitHub Pages on every push to `main` that changes `docs/`.

## Releases

The packages are versioned together with [Changesets](https://github.com/changesets/changesets). Describe a user-facing change with `pnpm changeset` and commit the file it writes. The release workflow opens a "Version packages" PR; merging it publishes to npm.

## CI

Every push and pull request runs the unit tests with coverage, the integration tests against all five databases and Redis, and the end-to-end test of the Docker image over each database, with and without the cache.
