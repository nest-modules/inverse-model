# Contribuir

El repositorio es un monorepo de pnpm y Turborepo:

| Ruta | Paquete | Qué es |
|---|---|---|
| `packages/inverse-model` | `@nestjs-modules/inverse-model` | La librería |
| `apps/cli` | `@nestjs-modules/inverse` | El comando `inverse` |
| `packages/generator` | `@nestjs-modules/inverse-generator` | Los archivos que escribe el CLI |
| `samples/blog` | | Una app y un schema pequeños para probar la librería |
| `docs` | | Este sitio |

## Configuración

Node.js 24 y pnpm 11:

```sh
pnpm install
pnpm build
pnpm test
pnpm check
```

## Tests de integración

`compose.yaml` inicia cada base de datos con el ejemplo del blog cargado, además de Redis:

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

Una base de datos sin URL se omite. Si un puerto está ocupado, cámbialo con `POSTGRES_PORT`, `MYSQL_PORT`, `MARIADB_PORT`, `SQLSERVER_PORT`, `MONGODB_PORT` o `REDIS_PORT`. Docker necesita unos 2 GB de memoria para todas a la vez.

## Test end-to-end

La app de ejemplo se ejecuta en Docker sobre cualquiera de las bases de datos, y un script prueba toda la API a través de GraphQL:

```sh
DATABASE_URL=postgres://inverse:inverse@postgres:5432/inverse_blog docker compose up -d --build --wait app
node scripts/smoke-test.mjs
```

## Documentación

```sh
pnpm --filter inverse-model-docs dev
```

El sitio se construye con VitePress y se publica en GitHub Pages con cada push a `main` que cambie `docs/`.

## Releases

Los paquetes se versionan juntos con [Changesets](https://github.com/changesets/changesets). Describe un cambio visible para los usuarios con `pnpm changeset` y haz commit del archivo que genera. El workflow de release abre un PR "Version packages"; al hacer merge se publica en npm.

## CI

Cada push y pull request ejecuta los tests unitarios con cobertura, los tests de integración contra las cinco bases de datos y Redis, y el test end-to-end de la imagen de Docker sobre cada base de datos, con y sin cache.
