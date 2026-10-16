# Opciones

Todo lo que aceptan `InverseModelModule.forRoot()` y `forRootAsync()`.

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

## Conexión

| Opción | Por defecto | Qué hace |
|---|---|---|
| `url` | (obligatoria) | Cadena de conexión; su protocolo elige la base de datos. Consulta [Bases de datos](/es/databases/). |
| `ssl` | el del driver | `true`, o `{ rejectUnauthorized, ca, cert, key }` con contenido PEM. Consulta [TLS](/es/databases/#tls). |

## Forma de la API

| Opción | Por defecto | Qué hace |
|---|---|---|
| `pagination.defaultLimit` | `100` | Filas que devuelve una lista sin `limit`. |
| `pagination.maxLimit` | `1000` | El `limit` más grande aceptado, y el máximo de filas que escriben `createMany` y `deleteMany`. |
| `naming.type` | PascalCase en singular | `(table) => string`: nombre del tipo de una tabla, dado su nombre tal como aparece listado (calificado con el schema donde la base de datos tiene schemas). Consulta [Nombres](/es/guide/naming). |
| `naming.field` | camelCase | `(column, table) => string`: nombre del campo de una columna. |
| `naming.plural` | plural en inglés | `(type) => string`: plural de un nombre de tipo, para listas, conteos y relaciones a muchos. |
| `rename.tables` | `{}` | Nombre de tipo por tabla, por ejemplo `{ blog_posts: 'Article' }`. Consulta [Renombrar](/es/guide/extending#renombrar). |
| `rename.fields` | `{}` | Nombre de campo por `table.column`, por ejemplo `{ 'authors.full_name': 'name' }`. |
| `views` | `{}` | Por nombre de vista, `primaryKey` (columnas) y `foreignKeys` (`{ columns, table, references }`). Consulta [Vistas](/es/guide/relations#vistas). |

## Seguridad

Consulta [Seguridad](/es/guide/security).

| Opción | Por defecto | Qué hace |
|---|---|---|
| `include` | todo | Tablas y campos `table.column` a exponer; `*` coincide con cualquier nombre. |
| `exclude` | nada | Tablas y campos a ocultar; tiene prioridad sobre `include`. |
| `readOnly` | `false` | `true`, o las tablas que no tienen mutations. |
| `queryLimits.maxDepth` | `10` | El anidamiento de campos más profundo que puede tener una query. |
| `queryLimits.maxComplexity` | `50000` | El costo estimado más alto de una query. |
| `authorize` | permitir todo | `({ model, type, operation, context, args }) => boolean \| Promise<boolean>`. |
| `scope` | ninguno | `({ model, type, operation, context }) => Where \| null`, combinado con AND en lecturas, updates y deletes. |

## Cache

Consulta [Cache](/es/guide/caching).

| Opción | Por defecto | Qué hace |
|---|---|---|
| `cache.url` | (sin cache) | Cadena de conexión de Redis. Necesita `ioredis`. |
| `cache.ttl` | `60` | Segundos que se conserva un resultado. |
| `cache.ttlByTable` | `{}` | TTL por tabla; `0` deja una tabla sin cache. |
| `cache.keyPrefix` | `inverse:` | Prefijo de cada clave de Redis. |

## Extender

Consulta [Extender la API](/es/guide/extending).

| Opción | Por defecto | Qué hace |
|---|---|---|
| `hooks` | ninguno | Por tabla, o `*`: `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`. |
| `extend.typeDefs` | ninguno | SDL que se combina con el schema generado. |
| `extend.resolvers` | ninguno | Resolvers, o una función de `{ connection, model, writes }` que los devuelve. |

## Apollo

| Opción | Por defecto | Qué hace |
|---|---|---|
| `graphql` | `{}` | Cualquier opción de `ApolloDriverConfig` excepto `driver`, `typeDefs` y `resolvers`, que vienen de la base de datos: `path`, `context`, `introspection`, `plugins`, `formatError`… |

## `forRootAsync`

Toma las opciones de una factory, así que pueden venir de `@nestjs/config` o de cualquier otro provider:

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

`useClass` y `useExisting` también funcionan, con una clase cuyo `createInverseModelOptions()` devuelva las opciones. Las opciones se pueden inyectar mediante el token `INVERSE_MODEL_OPTIONS`.
