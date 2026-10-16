# Seguridad

Por defecto, la API lee y escribe en cada tabla que encuentra. Antes de que llegue a producción, acótala.

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  include: ['authors', 'blog_posts', 'audit_*'],
  exclude: ['*.password_hash', 'authors.email'],
  readOnly: ['audit_*'],
  queryLimits: { maxDepth: 10, maxComplexity: 50000 },
  authorize: ({ operation, context }) =>
    operation === 'list' || context.req.user?.isAdmin === true,
  scope: ({ type, context }) =>
    type === 'BlogPost' ? { tenantId: { eq: context.req.user.tenantId } } : null,
});
```

Además, conéctate con un usuario de base de datos que solo tenga los permisos que la API debe tener. Las opciones de abajo son una segunda línea de defensa, no un reemplazo de los permisos de la base de datos.

## Qué tablas y campos

`include` y `exclude` reciben nombres de tablas o colecciones, solos o con su schema (`public.users`), y nombres `table.column`. `*` coincide con cualquier nombre.

- Sin `include`, se expone cada tabla; con él, solo las que lista.
- `exclude` tiene prioridad sobre `include`.
- Un campo oculto sale del tipo, de los inputs, de los filtros y del orden.
- Una tabla oculta se lleva sus relaciones con ella.

## Solo lectura

`readOnly: true` hace que toda la API sea de solo lectura. Una lista de nombres hace que solo esas tablas sean de solo lectura: no obtienen mutations de crear, actualizar, eliminar, upsert ni batch. Si no hay nada en lo que se pueda escribir, no hay tipo `Mutation` en absoluto.

## Límites de consulta

| Opción | Por defecto | Limita |
|---|---|---|
| `queryLimits.maxDepth` | `10` | Qué tan profundo pueden anidarse los campos. La introspección no cuenta. |
| `queryLimits.maxComplexity` | `50000` | El costo estimado de una consulta: cada campo cuesta 1, multiplicado por las filas de las listas en las que está (su `limit`, o `pagination.defaultLimit`). |

Las consultas que superan un límite se rechazan antes de ejecutarse. Los tamaños de página los limita [`pagination`](./pagination).

## Autorización

Los guards de Nest no se ejecutan en los resolvers generados, así que el control de acceso va en `authorize` y `scope`. Ambos reciben:

| Propiedad | Valor |
|---|---|
| `model` | La tabla o colección, p. ej. `blog_posts`; las tablas fuera del schema por defecto lo conservan, p. ej. `audit.users` |
| `type` | Su nombre en GraphQL, p. ej. `BlogPost` |
| `operation` | `list`, `count`, `byPk`, `create`, `update` o `delete` |
| `context` | El contexto de GraphQL: `{ req }` salvo que `graphql.context` indique otra cosa |

### `authorize`

Se consulta antes de cada operación, también con los `args` del campo. Devolver `false` responde con un error `FORBIDDEN`.

- Los campos de relación y los filtros por relación piden `list` del tipo al que apuntan.
- Una connection pide `list`.
- Un upsert pide `create` y `update`.
- `createMany` y `deleteMany` piden `create` y `delete`.

```ts
authorize: async ({ type, operation, context }) => {
  const user = context.req.user;
  if (!user) return operation === 'list' || operation === 'count' || operation === 'byPk';
  return type !== 'AuditLog' || user.roles.includes('admin');
},
```

### `scope`

Devuelve un filtro que se combina con AND en cada lectura, actualización y eliminación del tipo: listas, conteos, búsquedas por clave, relaciones y sus batches, filtros por relación, connections y `deleteMany`. También forma parte de la clave de cache, así que los tenants nunca comparten resultados en cache. Así es como una API multi-tenant mantiene separados a los tenants:

```ts
scope: ({ type, context }) =>
  ['BlogPost', 'Author'].includes(type)
    ? { tenantId: { eq: context.req.user.tenantId } }
    : null,
```

- El filtro usa los nombres de campo de la API (`tenantId`), no los de las columnas.
- Una actualización o eliminación de una fila fuera del scope se comporta como si la fila no existiera, y un upsert de una responde `FORBIDDEN`.
- Las escrituras que los [hooks](./extending#hooks) ejecutan en su transacción también tienen scope.
- `scope` no comprueba lo que un create o update *escribe*. Revisa `args.input` en `authorize`, o asigna el tenant en un hook `beforeCreate`.

## Errores

Los errores de la base de datos nunca llegan al cliente. Este recibe `Internal server error` con un `errorId`, y el error original se registra con el `Logger` de Nest bajo ese id.

Los errores de validación, y los errores lanzados a propósito (un `GraphQLError` o una `HttpException` de Nest, por ejemplo desde un hook), pasan tal como son. Las contraseñas de la base de datos y las URLs de Redis se ocultan en cada error y línea de log.

## Introspección

Apollo desactiva la introspección cuando `NODE_ENV=production`. Actívala con `graphql: { introspection: true }` si quieres que herramientas como GraphiQL funcionen en producción.
