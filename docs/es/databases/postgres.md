# PostgreSQL

```sh
npm install pg
```

```ts
InverseModelModule.forRoot({ url: 'postgres://user:pass@host:5432/db' });
```

`postgresql://` también funciona. Agrega `?sslmode=require` a la URL, o usa la opción [`ssl`](./#tls), para TLS.

## Qué se lee

Cada tabla y vista de cada schema excepto `pg_catalog` e `information_schema`, con sus claves primarias y foráneas.

Las tablas del schema actual (normalmente `public`) se nombran solo por su nombre, `blog_posts`, en cada opción que recibe nombres de tablas: `include`, `exclude`, `readOnly`, `hooks`, `rename`, `cache.ttlByTable`, y el `model` que reciben `authorize` y `scope`. Las tablas de otros schemas conservan el schema: `audit.users`. Su nombre en GraphQL lo omite (`User`), así que dos tablas con el mismo nombre en schemas distintos necesitan [`naming`](/es/guide/naming).

## Tipos

| Columna | GraphQL |
|---|---|
| `smallint`, `integer` | `Int` |
| `real`, `double precision` | `Float` |
| `bigint`, `numeric`, `decimal` | `String`, para conservar su precisión |
| `boolean` | `Boolean` |
| `date`, `timestamp`, `timestamptz` | `DateTime` |
| `json`, `jsonb` | `JSON` |
| arrays | una lista del tipo del elemento, por ejemplo `[String]` |
| `uuid`, `text`, `varchar`, enums, cualquier otro | `String` |

## Seguridad a nivel de fila

La seguridad a nivel de fila de Postgres se aplica al usuario de base de datos con el que se conecta la API. Para mantener separados a los tenants en la propia API, usa [`scope`](/es/guide/security#scope).
