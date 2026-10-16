# Pagination

There are two ways to page through a table: `limit` and `offset` on the list query, or cursors on the connection query.

## Limit and offset

```graphql
{
  blogPosts(orderBy: [{ id: ASC }], limit: 20, offset: 40) { id title }
  blogPostsCount
}
```

- Without `limit`, a list returns `pagination.defaultLimit` rows (100 by default).
- A `limit` above `pagination.maxLimit` (1000 by default) is lowered to it.
- Without `orderBy`, rows are sorted by primary key.

Both limits are [options](/reference/options):

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  pagination: { defaultLimit: 50, maxLimit: 500 },
});
```

## Cursors

Every table with a primary key also gets a Relay-style connection:

```graphql
{
  blogPostsConnection(first: 20, orderBy: [{ rating: DESC }], where: { published: { eq: true } }) {
    edges {
      cursor
      node { id title rating }
    }
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    totalCount
  }
}
```

Pass `endCursor` as `after` to get the next page, or `startCursor` as `before` with `last` to go back:

```graphql
{
  blogPostsConnection(first: 20, after: "eyJ…") { edges { node { title } } pageInfo { hasNextPage endCursor } }
}
```

Cursors are opaque: they hold the values of the `orderBy` fields plus the primary key of the row, so pages stay correct when rows are inserted in between, and ties in the order are broken by key. Null values are ordered consistently on every database.

Use cursors for infinite scroll and large tables; offsets get slower the further they go, cursors don't.

## Relations

Lists inside a relation take the same `where`, `orderBy`, `limit` and `offset`:

```graphql
{
  authors {
    fullName
    blogPosts(orderBy: [{ rating: DESC }], limit: 3) { title }
  }
}
```

Without any of those arguments, the related rows of every author are fetched in one batched query. With them, each author's list is its own query.
