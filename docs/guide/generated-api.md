# The generated API

Every table or collection becomes a GraphQL type with its queries and mutations. The examples on these pages use this schema:

```sql
CREATE TABLE authors (
  id         serial PRIMARY KEY,
  full_name  text NOT NULL,
  email      varchar(255) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blog_posts (
  id         bigserial PRIMARY KEY,
  author_id  integer NOT NULL REFERENCES authors (id),
  title      text NOT NULL,
  body       text,
  published  boolean NOT NULL DEFAULT false,
  rating     double precision,
  metadata   jsonb
);
```

## Types

```graphql
type Author {
  id: Int!
  fullName: String!
  email: String!
  createdAt: DateTime!
  blogPosts(where: BlogPostWhere, orderBy: [BlogPostOrderBy!], limit: Int, offset: Int): [BlogPost!]!
}

type BlogPost {
  id: String!        # bigint keeps its precision as a String
  authorId: Int!
  title: String!
  body: String
  published: Boolean!
  rating: Float
  metadata: JSON
  author: Author
}
```

A column that is `NOT NULL` is non-null in the type. Each type also gets a `…Where` input for [filters](./filters), an `…OrderBy` input for [ordering](./filters#ordering), and `Create…Input` / `Update…Input` inputs for [mutations](./mutations).

## Queries

```graphql
type Query {
  authors(where: AuthorWhere, orderBy: [AuthorOrderBy!], limit: Int, offset: Int): [Author!]!
  authorsCount(where: AuthorWhere): Int!
  author(id: Int!): Author
  authorsConnection(where: AuthorWhere, orderBy: [AuthorOrderBy!], first: Int, after: String, last: Int, before: String): AuthorConnection!
  # … the same for BlogPost
}
```

| Query | Returns |
|---|---|
| `authors` | A page of rows. See [Pagination](./pagination). |
| `authorsCount` | How many rows match the filter. |
| `author(id:)` | The row with that primary key, or `null`. A composite key takes one argument per column. |
| `authorsConnection` | A Relay-style connection with cursors and `totalCount`. See [Pagination](./pagination#cursors). |

## Mutations

```graphql
type Mutation {
  createAuthor(input: CreateAuthorInput!): Author!
  updateAuthor(id: Int!, input: UpdateAuthorInput!): Author
  deleteAuthor(id: Int!): Author
  upsertAuthor(input: CreateAuthorInput!): Author!
  createManyAuthors(inputs: [CreateAuthorInput!]!): Int!
  deleteManyAuthors(where: AuthorWhere!): Int!
}
```

See [Mutations](./mutations).

## What depends on the schema

| The table has | It gets |
|---|---|
| A primary key | Everything above. |
| No primary key | A list, a count, `create` and `createMany` only: there is no key to find, update, delete or page by cursor. |
| Only key columns (a join table) | No `update`, since there is nothing else to change. |
| Foreign keys | [Relations](./relations) on both sides. |

SQL views are exposed read-only. See [Views](./relations#views).

## Scalars

| Scalar | Values |
|---|---|
| `DateTime` | ISO 8601 strings, e.g. `2026-10-16T13:45:00.000Z`. |
| `JSON` | Any JSON value, for `json` and `jsonb` columns and mixed-type MongoDB fields. |

The full mapping from database column types is in [Type mapping](/reference/type-mapping).

## A `health` query

The schema always has a `health: String!` query that answers `"ok"`. GraphQL requires a `Query` type, and this keeps the schema valid even for a database with no tables. It also makes a cheap health check.
