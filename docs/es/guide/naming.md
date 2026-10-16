# Nombres

## Los valores por defecto

| Nombre en la base de datos | Nombre en la API | Regla |
|---|---|---|
| tabla `blog_posts` | tipo `BlogPost` | PascalCase en singular |
| tabla `people` | tipo `Person` | se conocen los plurales irregulares |
| columna `created_at` | campo `createdAt` | camelCase |
| schema `public.blog_posts` | tipo `BlogPost` | se omite el schema |

Las operaciones usan el plural o el singular del tipo:

| Operación | Nombre |
|---|---|
| Lista, conteo, connection | `blogPosts`, `blogPostsCount`, `blogPostsConnection` |
| Por clave | `blogPost(id:)` |
| Crear, actualizar, eliminar, upsert | `createBlogPost`, `updateBlogPost`, `deleteBlogPost`, `upsertBlogPost` |
| Batches | `createManyBlogPosts`, `deleteManyBlogPosts` |

Una palabra cuyo singular y plural son iguales, como `news`, obtiene `newsByPk` para su query por clave, para que no choque con la lista.

## La opción `naming`

Cada función que omitas conserva su valor por defecto:

```ts
import { defaultNaming, InverseModelModule } from '@nestjs-modules/inverse-model';

InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  naming: {
    // Recibe la tabla tal como se lista: con su schema donde la base de datos tiene schemas.
    type: (table) => (table === 'audit.users' ? 'AuditUser' : defaultNaming.type(table)),
    // Recibe la columna y su tabla.
    field: (column, table) => defaultNaming.field(column, table),
    // Recibe un nombre de tipo; se usa para listas, conteos y relaciones a muchos.
    plural: (type) => defaultNaming.plural(type),
  },
});
```

`defaultNaming`, `singularize` y `pluralize` se exportan, así que una personalización puede construirse sobre ellos. Para renombrar unas pocas tablas o columnas, [`rename`](./extending#renombrar) es más simple.

## Comprobación de nombres

La app no arranca, con un error que lista las tablas involucradas, cuando:

- dos tablas terminan con el mismo nombre, como `public.users` y `audit.users`, que son ambas `User`;
- un nombre choca con uno que la API ya usa (`Query`, `Mutation`, `Int`, `String`, `DateTime`, `JSON`, `SortDirection`, `PageInfo`, los inputs `…Filter`);
- un nombre no es válido en GraphQL, como uno que empieza con un dígito (`1st_quarter`) o con `__`.

Las tablas ocultas con [`exclude`](./security#que-tablas-y-campos) no cuentan, así que excluir una de dos tablas que chocan también corrige el error.
