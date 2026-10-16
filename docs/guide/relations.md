# Relations

Every foreign key gives a field on both sides. With `blog_posts.author_id` referencing `authors.id`:

```graphql
type BlogPost {
  author: Author                    # the row the key points at
}

type Author {
  blogPosts(where: BlogPostWhere, orderBy: [BlogPostOrderBy!], limit: Int, offset: Int): [BlogPost!]!
}
```

```graphql
{
  authors {
    fullName
    blogPosts { title author { email } }
  }
}
```

## Names

- The field on the side holding the key is named after the key without its `id` suffix: `author_id` gives `author`. A composite key, or one without that suffix, is named after the type it points at (`user`).
- The field on the other side is the plural of the type holding the key: `blogPosts`.
- Two keys from one table to the same table are told apart by the key: `messagesBySenderId` and `messagesByRecipientId`.
- A name already taken by a column or another relation gets a number: `user2`.

The [`naming`](./naming) and [`rename`](./extending#renames) options change them.

## Batching

Relations are resolved with DataLoader, one loader per request. Loading 100 posts with their authors takes two queries, one for the posts and one for all their authors, instead of 101. Loaders never share data between requests.

## Composite keys

Foreign keys over several columns work the same way: the relation matches on all the columns.

## Views

SQL views are exposed read-only: they can be listed, counted, filtered and followed, but never written. A view has no keys of its own, so declare them with the `views` option to give it a by-key query, a connection and relations:

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  views: {
    published_posts: {
      primaryKey: ['id'],
      foreignKeys: [{ columns: ['author_id'], table: 'authors', references: ['id'] }],
    },
  },
});
```

## MongoDB references

MongoDB has no foreign keys, so references are inferred:

- An id field named `author_id` or `authorId` points at the `author` or `authors` collection, and `category_id` at `categories`.
- A DBRef points at the collection it names.
- An array of ids named `tag_ids` or `tagIds` is a list of `tags`.

See [MongoDB](/databases/mongodb).
