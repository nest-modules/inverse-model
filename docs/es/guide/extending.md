# Extender la API

## Hooks

Los hooks ejecutan código alrededor de las escrituras generadas, por nombre de tabla o colección, o `*` para todas:

```ts
import { GraphQLError } from 'graphql';

InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  hooks: {
    blog_posts: {
      beforeCreate: ({ input, context }) => {
        if (!context.req.user) throw new GraphQLError('Inicia sesión para publicar');
        return { ...input, slug: slugify(input.title) }; // se escribe en lugar del input
      },
    },
    '*': {
      afterUpdate: ({ model, key, transaction }) =>
        transaction.manager?.query('INSERT INTO audit_log (message) VALUES ($1)', [
          `${model.source} ${JSON.stringify(key)} updated`,
        ]),
    },
  },
  graphql: { context: ({ req }) => ({ req }) },
});
```

Los hooks son `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete` y `afterDelete`. Cada uno recibe `{ model, input, key, record, context, transaction }`.

- Los registros y los inputs usan los nombres de campo de la API.
- Un before-hook puede devolver un input nuevo para escribirlo en su lugar; lanzar un error aborta la escritura con ese error.
- En cada paso, los hooks `*` se ejecutan primero, y luego los de la tabla.
- Las actualizaciones y eliminaciones de un registro inexistente no ejecutan hooks.
- Las mutations en batch ejecutan los hooks para cada fila.

## Transacciones

Una escritura se ejecuta con sus hooks en una sola transacción: si un after-hook lanza un error, la escritura se revierte.

- Las consultas a través de `transaction.connection` forman parte de la transacción.
- También las consultas directas a través de `transaction.manager`, que es el `EntityManager` de TypeORM en las bases de datos SQL, o las llamadas a MongoDB a las que se les pasa `{ session: transaction.session }`.
- Los resultados en cache se borran cuando termina la transacción, nunca antes del commit.

MongoDB necesita un replica set o un clúster con sharding para las transacciones; basta con un replica set de un solo nodo. En un servidor standalone los hooks igual se ejecutan, pero `transaction.active` es `false` y cada escritura se aplica por separado, así que nada se revierte.

## Tus propios tipos y resolvers

`extend` combina tu SDL y tus resolvers con el schema generado. Usa `extend type` sobre los tipos generados, `Query` y `Mutation`, y los tipos e inputs generados:

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  extend: {
    typeDefs: `
      extend type Author { displayName: String! }
      extend type Mutation { signUp(input: CreateAuthorInput!): Author! }
    `,
    resolvers: ({ connection, model, writes }) => ({
      Author: { displayName: (author) => `${author.fullName} <${author.email}>` },
      Mutation: {
        signUp: (_, { input }, context) => writes.create(model('authors'), input, context),
      },
    }),
  },
});
```

`resolvers` puede ser un objeto o una función de `{ connection, model, writes }`:

- `connection` lee y escribe en la base de datos, con el mismo scope y las mismas restricciones que la API.
- `model(name)` busca una tabla o colección por nombre.
- `writes` ejecuta creates, updates y deletes con sus hooks y su transacción.

## Resolvers de Nest

Los resolvers de Nest en la misma app funcionan en modo schema-first: declara sus campos en `extend.typeDefs` y usa `@Resolver('Author')`, `@ResolveField()`, `@Query()` y `@Mutation()` con esos nombres. Se combinan con los resolvers generados campo por campo, y tienen prioridad donde ambos resuelven el mismo campo.

El modo code-first (`autoSchemaFile`, `@ObjectType()`) construye un schema propio y no se puede combinar con el generado.

## Renombrar

`rename` da a las tablas y columnas otros nombres en la API. Las relaciones siguen los nombres nuevos:

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  rename: {
    tables: { blog_posts: 'Article' },
    fields: { 'authors.full_name': 'name', 'blog_posts.author_id': 'writerId' },
  },
});
```

Con esto, `Article.writer` apunta al autor y `Author.articles` de vuelta a los posts. Para reglas que se aplican a todos los nombres, usa [`naming`](./naming).
