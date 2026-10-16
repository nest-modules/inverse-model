# Filters and ordering

## Filters

Every list, count, connection and `deleteMany` takes a `where` argument. Each field of the type has a filter input that depends on its type:

| Filter | Operators | Used for |
|---|---|---|
| `IntFilter`, `FloatFilter` | `eq` `ne` `gt` `gte` `lt` `lte` `in` `isNull` | Numbers |
| `DateTimeFilter` | `eq` `ne` `gt` `gte` `lt` `lte` `isNull` | Dates and timestamps |
| `StringFilter` | `eq` `ne` `in` `contains` `isNull` | Text, and `bigint`/`numeric` columns |
| `BooleanFilter` | `eq` `ne` `isNull` | Booleans |
| `IDFilter` | `eq` `ne` `in` `isNull` | MongoDB ids |
| `NullFilter` | `isNull` | JSON values and arrays |

`contains` is a case-insensitive substring match. `isNull: true` matches rows where the field is null (or, on MongoDB, missing).

All conditions on one field must hold, and so must the conditions on different fields:

```graphql
{
  blogPosts(where: { rating: { gte: 3, lt: 5 }, published: { eq: true } }) {
    title
  }
}
```

### AND, OR and NOT

```graphql
{
  blogPosts(
    where: {
      OR: [{ title: { contains: "graphql" } }, { rating: { gte: 4 } }]
      NOT: { body: { isNull: true } }
    }
  ) {
    title
  }
}
```

### Filtering by a relation

A relation to one row filters on that row's fields:

```graphql
{
  blogPosts(where: { author: { fullName: { contains: "ada" } } }) { title }
}
```

A relation to many rows takes `some`, `none` or `every`:

```graphql
{
  authors(where: { blogPosts: { some: { published: { eq: true } } } }) { fullName }
}
```

`every` is true for a row with no related rows at all. On SQL databases these compile to `EXISTS` subqueries; on MongoDB the related ids are read first.

## Ordering

`orderBy` takes a list; earlier entries take precedence:

```graphql
{
  blogPosts(orderBy: [{ published: DESC }, { rating: DESC }]) { title }
}
```

Each entry names one field with `ASC` or `DESC`. JSON fields and arrays can't be ordered by. Without `orderBy`, rows come sorted by primary key, so pages are stable.
