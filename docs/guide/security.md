# Security

By default the API reads and writes every table it finds. Before it reaches production, narrow it down.

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

Also connect with a database user that only has the rights the API should have. The options below are a second line of defense, not a replacement for database permissions.

## Which tables and fields

`include` and `exclude` take table or collection names, bare or schema-qualified (`public.users`), and `table.column` names. `*` matches any name.

- Without `include`, every table is exposed; with it, only the ones it lists.
- `exclude` wins over `include`.
- A hidden field leaves the type, the inputs, the filters and the ordering.
- A hidden table takes its relations with it.

## Read only

`readOnly: true` makes the whole API read-only. A list of names makes only those tables read-only: they get no create, update, delete, upsert or batch mutations. With nothing writable, there is no `Mutation` type at all.

## Query limits

| Option | Default | Limits |
|---|---|---|
| `queryLimits.maxDepth` | `10` | How deeply fields may nest. Introspection isn't counted. |
| `queryLimits.maxComplexity` | `50000` | The estimated cost of a query: each field costs 1, times the rows of the lists it's inside (their `limit`, or `pagination.defaultLimit`). |

Queries over a limit are rejected before they run. Page sizes are limited by [`pagination`](./pagination).

## Authorization

Nest guards don't run on the generated resolvers, so access control goes in `authorize` and `scope`. Both receive:

| Property | Value |
|---|---|
| `model` | The table or collection, e.g. `blog_posts`; tables outside the default schema keep it, e.g. `audit.users` |
| `type` | Its GraphQL name, e.g. `BlogPost` |
| `operation` | `list`, `count`, `byPk`, `create`, `update` or `delete` |
| `context` | The GraphQL context: `{ req }` unless `graphql.context` says otherwise |

### `authorize`

Asked before every operation, with the field's `args` too. Returning `false` answers a `FORBIDDEN` error.

- Relation fields and relation filters ask for `list` of the type they point at.
- A connection asks for `list`.
- An upsert asks for `create` and `update`.
- `createMany` and `deleteMany` ask for `create` and `delete`.

```ts
authorize: async ({ type, operation, context }) => {
  const user = context.req.user;
  if (!user) return operation === 'list' || operation === 'count' || operation === 'byPk';
  return type !== 'AuditLog' || user.roles.includes('admin');
},
```

### `scope`

Returns a filter that is ANDed into every read, update and delete of the type: lists, counts, lookups by key, relations and their batches, relation filters, connections and `deleteMany`. It is also part of the cache key, so tenants never share cached results. This is how a multi-tenant API keeps tenants apart:

```ts
scope: ({ type, context }) =>
  ['BlogPost', 'Author'].includes(type)
    ? { tenantId: { eq: context.req.user.tenantId } }
    : null,
```

- The filter uses the API's field names (`tenantId`), not the columns'.
- An update or delete of a row outside the scope behaves as if the row didn't exist, and an upsert of one answers `FORBIDDEN`.
- Writes that [hooks](./extending#hooks) run in their transaction are scoped too.
- `scope` doesn't check what a create or update *writes*. Check `args.input` in `authorize`, or set the tenant in a `beforeCreate` hook.

## Errors

Errors from the database never reach the client. It gets `Internal server error` with an `errorId`, and the original error is logged with Nest's `Logger` under that id.

Validation errors, and errors thrown on purpose (a `GraphQLError` or a Nest `HttpException`, for example from a hook), go through as they are. Passwords in the database and Redis URLs are hidden in every error and log line.

## Introspection

Apollo turns introspection off when `NODE_ENV=production`. Turn it on with `graphql: { introspection: true }` if you want tools like GraphiQL to work in production.
