# Options

Everything `InverseModelModule.forRoot()` and `forRootAsync()` accept.

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  ssl: true,
  cache: { url: process.env.REDIS_URL!, ttl: 60 },
  pagination: { defaultLimit: 100, maxLimit: 1000 },
  include: ['authors', 'blog_posts'],
  readOnly: ['audit_*'],
  graphql: { introspection: true },
});
```

## Connection

| Option | Default | What it does |
|---|---|---|
| `url` | (required) | Connection string; its protocol picks the database. See [Databases](/databases/). |
| `ssl` | driver default | `true`, or `{ rejectUnauthorized, ca, cert, key }` with PEM contents. See [TLS](/databases/#tls). |

## API shape

| Option | Default | What it does |
|---|---|---|
| `pagination.defaultLimit` | `100` | Rows a list returns without `limit`. |
| `pagination.maxLimit` | `1000` | Largest `limit` accepted, and the most rows `createMany` and `deleteMany` write. |
| `naming.type` | singular PascalCase | `(table) => string`: type name of a table, given its name as listed (schema-qualified where the database has schemas). See [Naming](/guide/naming). |
| `naming.field` | camelCase | `(column, table) => string`: field name of a column. |
| `naming.plural` | English plural | `(type) => string`: plural of a type name, for lists, counts and to-many relations. |
| `rename.tables` | `{}` | Type name per table, e.g. `{ blog_posts: 'Article' }`. See [Renames](/guide/extending#renames). |
| `rename.fields` | `{}` | Field name per `table.column`, e.g. `{ 'authors.full_name': 'name' }`. |
| `views` | `{}` | Per view name, `primaryKey` (columns) and `foreignKeys` (`{ columns, table, references }`). See [Views](/guide/relations#views). |

## Security

See [Security](/guide/security).

| Option | Default | What it does |
|---|---|---|
| `include` | everything | Tables and `table.column` fields to expose; `*` matches any name. |
| `exclude` | nothing | Tables and fields to hide; wins over `include`. |
| `readOnly` | `false` | `true`, or the tables that get no mutations. |
| `queryLimits.maxDepth` | `10` | Deepest nesting of fields a query may have. |
| `queryLimits.maxComplexity` | `50000` | Largest estimated cost of a query. |
| `authorize` | allow all | `({ model, type, operation, context, args }) => boolean \| Promise<boolean>`. |
| `scope` | none | `({ model, type, operation, context }) => Where \| null`, ANDed into reads, updates and deletes. |

## Cache

See [Caching](/guide/caching).

| Option | Default | What it does |
|---|---|---|
| `cache.url` | (no cache) | Redis connection string. Needs `ioredis`. |
| `cache.ttl` | `60` | Seconds a result is kept. |
| `cache.ttlByTable` | `{}` | TTL per table; `0` leaves a table uncached. |
| `cache.keyPrefix` | `inverse:` | Prefix of every Redis key. |

## Extending

See [Extending the API](/guide/extending).

| Option | Default | What it does |
|---|---|---|
| `hooks` | none | Per table, or `*`: `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`. |
| `extend.typeDefs` | none | SDL merged into the generated schema. |
| `extend.resolvers` | none | Resolvers, or a function of `{ connection, model, writes }` that returns them. |

## Apollo

| Option | Default | What it does |
|---|---|---|
| `graphql` | `{}` | Any `ApolloDriverConfig` option except `driver`, `typeDefs` and `resolvers`, which come from the database: `path`, `context`, `introspection`, `plugins`, `formatError`… |

## `forRootAsync`

Takes the options from a factory, so they can come from `@nestjs/config` or any other provider:

```ts
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot(),
    InverseModelModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        url: config.getOrThrow('DATABASE_URL'),
        cache: config.get('REDIS_URL') ? { url: config.get('REDIS_URL') } : undefined,
      }),
    }),
  ],
})
export class AppModule {}
```

`useClass` and `useExisting` work too, with a class whose `createInverseModelOptions()` returns the options. The options are injectable through the `INVERSE_MODEL_OPTIONS` token.
