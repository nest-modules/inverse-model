# MongoDB

```sh
npm install mongodb
```

```ts
InverseModelModule.forRoot({ url: 'mongodb://host:27017/db' });
InverseModelModule.forRoot({ url: 'mongodb+srv://user:pass@cluster.example.net/db' });
```

The database is the one in the URL's path.

## Inferred schema

A collection has no schema, so its fields are inferred from a sample of 100 documents, read when the app starts:

| Values | GraphQL |
|---|---|
| strings | `String` |
| integers | `Int` |
| numbers with decimals, or a mix of integers and decimals | `Float` |
| booleans | `Boolean` |
| dates | `DateTime` |
| ObjectIds | `ID` |
| `Decimal128`, `Long` and other BSON types | `String`, to keep their precision |
| objects and arrays | `JSON` |
| values of different types in different documents | `JSON` |

- `_id` becomes `id: ID!`, and is the primary key.
- Every other field is optional, since any document may leave it out.
- A field that is `null` in every sampled document is left out.
- A field that appears only in documents outside the sample isn't in the API. Restart the app after adding fields to make them appear.

## References

MongoDB has no foreign keys, so references are inferred:

- An id field named `author_id` or `authorId` references the `author` or `authors` collection, and `category_id` references `categories`.
- A DBRef references the collection it names.
- An array of ids named `tag_ids` or `tagIds` is a list of `tags`.

Each reference becomes a [relation](/guide/relations) on both sides. Ids are passed and returned as hex strings; the API converts them to ObjectIds.

## Transactions

[Hooks](/guide/extending#hooks) run in a transaction only on a replica set or a sharded cluster; a single-node replica set is enough. On a standalone server, `transaction.active` is `false` and each write applies on its own. Add `?directConnection=true` to the URL to connect to a single-node replica set from outside its network.
