# Mutations

Every writable table gets six mutations.

## Create

```graphql
mutation {
  createAuthor(input: { fullName: "Ada Lovelace", email: "ada@example.com" }) {
    id
    createdAt
  }
}
```

The input requires the columns that are `NOT NULL` and have no default. Columns the database fills in, such as serial keys and `DEFAULT now()`, may be left out, and come back in the result.

## Update

```graphql
mutation {
  updateAuthor(id: 1, input: { fullName: "Ada King" }) { fullName }
}
```

Every field of the input is optional; only the ones given change. The primary key can't be changed. It returns `null` when no row has that key.

## Delete

```graphql
mutation {
  deleteAuthor(id: 1) { email }
}
```

It returns the deleted row, or `null` when there was none.

## Upsert

```graphql
mutation {
  upsertAuthor(input: { id: 1, fullName: "Ada", email: "ada@example.com" }) { id }
}
```

It updates the row whose primary key is in the input, or creates it when there is none.

## Batches

```graphql
mutation {
  createManyAuthors(inputs: [{ fullName: "Ada", email: "a@x.com" }, { fullName: "Alan", email: "b@x.com" }])
  deleteManyAuthors(where: { email: { contains: "@x.com" } })
}
```

Both return how many rows they wrote. They refuse more than `pagination.maxLimit` rows, so a filter mistake can't delete a whole table past that limit. [Hooks](./extending#hooks) run for each row, all in one transaction.

## Which tables are writable

- Tables in [`readOnly`](./security#read-only), and SQL views, get no mutations.
- Tables without a primary key get only `create` and `createMany`.
- Join tables, whose columns are all key, get no `update`.
- With nothing writable, the schema has no `Mutation` type.

## Errors

A write the database rejects, such as a duplicate unique value or a missing foreign key, answers `Internal server error` with an `errorId`; the database's message is logged under that id, never sent to the client. See [Security](./security#errors).
