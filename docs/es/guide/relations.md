# Relaciones

Cada clave foránea da un campo a ambos lados. Con `blog_posts.author_id` referenciando a `authors.id`:

```graphql
type BlogPost {
  author: Author                    # la fila a la que apunta la clave
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

## Nombres

- El campo del lado que tiene la clave se nombra según la clave sin su sufijo `id`: `author_id` da `author`. Una clave compuesta, o una sin ese sufijo, se nombra según el tipo al que apunta (`user`).
- El campo del otro lado es el plural del tipo que tiene la clave: `blogPosts`.
- Dos claves de una tabla hacia la misma tabla se distinguen por la clave: `messagesBySenderId` y `messagesByRecipientId`.
- Un nombre que ya usa una columna u otra relación recibe un número: `user2`.

Las opciones [`naming`](./naming) y [`rename`](./extending#renombrar) los cambian.

## Batching

Las relaciones se resuelven con DataLoader, un loader por petición. Cargar 100 posts con sus autores toma dos consultas, una para los posts y otra para todos sus autores, en lugar de 101. Los loaders nunca comparten datos entre peticiones.

## Claves compuestas

Las claves foráneas sobre varias columnas funcionan igual: la relación compara todas las columnas.

## Vistas

Las vistas SQL se exponen como solo lectura: se pueden listar, contar, filtrar y seguir, pero nunca escribir. Una vista no tiene claves propias, así que decláralas con la opción `views` para darle una query por clave, una connection y relaciones:

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

## Referencias en MongoDB

MongoDB no tiene claves foráneas, así que las referencias se infieren:

- Un campo de id llamado `author_id` o `authorId` apunta a la colección `author` o `authors`, y `category_id` a `categories`.
- Un DBRef apunta a la colección que nombra.
- Un array de ids llamado `tag_ids` o `tagIds` es una lista de `tags`.

Consulta [MongoDB](/es/databases/mongodb).
