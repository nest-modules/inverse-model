# Naming

## The defaults

| Database name | API name | Rule |
|---|---|---|
| table `blog_posts` | type `BlogPost` | singular PascalCase |
| table `people` | type `Person` | irregular plurals are known |
| column `created_at` | field `createdAt` | camelCase |
| schema `public.blog_posts` | type `BlogPost` | the schema is left out |

Operations take the plural or the singular of the type:

| Operation | Name |
|---|---|
| List, count, connection | `blogPosts`, `blogPostsCount`, `blogPostsConnection` |
| By key | `blogPost(id:)` |
| Create, update, delete, upsert | `createBlogPost`, `updateBlogPost`, `deleteBlogPost`, `upsertBlogPost` |
| Batches | `createManyBlogPosts`, `deleteManyBlogPosts` |

A word whose singular and plural are the same, like `news`, gets `newsByPk` for its by-key query, so it doesn't clash with the list.

## The `naming` option

Each function you leave out keeps its default:

```ts
import { defaultNaming, InverseModelModule } from '@nestjs-modules/inverse-model';

InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  naming: {
    // Gets the table as listed: schema-qualified where the database has schemas.
    type: (table) => (table === 'audit.users' ? 'AuditUser' : defaultNaming.type(table)),
    // Gets the column and its table.
    field: (column, table) => defaultNaming.field(column, table),
    // Gets a type name; used for lists, counts and to-many relations.
    plural: (type) => defaultNaming.plural(type),
  },
});
```

`defaultNaming`, `singularize` and `pluralize` are exported, so an override can build on them. To rename a few tables or columns, [`rename`](./extending#renames) is simpler.

## Name checks

The app fails to start, with an error that lists the tables involved, when:

- two tables end up with the same name, such as `public.users` and `audit.users`, which are both `User`;
- a name clashes with one the API already uses (`Query`, `Mutation`, `Int`, `String`, `DateTime`, `JSON`, `SortDirection`, `PageInfo`, the `…Filter` inputs);
- a name isn't valid in GraphQL, such as one that starts with a digit (`1st_quarter`) or with `__`.

Tables hidden with [`exclude`](./security#which-tables-and-fields) don't count, so excluding one of two clashing tables also fixes the error.
