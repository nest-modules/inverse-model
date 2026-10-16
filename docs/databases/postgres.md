# PostgreSQL

```sh
npm install pg
```

```ts
InverseModelModule.forRoot({ url: 'postgres://user:pass@host:5432/db' });
```

`postgresql://` works too. Add `?sslmode=require` to the URL, or use the [`ssl`](./#tls) option, for TLS.

## What is read

Every table and view in every schema except `pg_catalog` and `information_schema`, with its primary and foreign keys.

Tables in the current schema (usually `public`) go by their bare name, `blog_posts`, in every option that takes table names: `include`, `exclude`, `readOnly`, `hooks`, `rename`, `cache.ttlByTable`, and the `model` that `authorize` and `scope` receive. Tables in other schemas keep the schema: `audit.users`. Their GraphQL name leaves it out (`User`), so two tables with the same name in different schemas need [`naming`](/guide/naming).

## Types

| Column | GraphQL |
|---|---|
| `smallint`, `integer` | `Int` |
| `real`, `double precision` | `Float` |
| `bigint`, `numeric`, `decimal` | `String`, to keep their precision |
| `boolean` | `Boolean` |
| `date`, `timestamp`, `timestamptz` | `DateTime` |
| `json`, `jsonb` | `JSON` |
| arrays | a list of the element type, e.g. `[String]` |
| `uuid`, `text`, `varchar`, enums, anything else | `String` |

## Row-level security

Postgres row-level security applies to the database user the API connects with. To keep tenants apart in the API itself, use [`scope`](/guide/security#scope).
