# Paginación

Hay dos formas de paginar una tabla: `limit` y `offset` en la query de lista, o cursores en la query de connection.

## Limit y offset

```graphql
{
  blogPosts(orderBy: [{ id: ASC }], limit: 20, offset: 40) { id title }
  blogPostsCount
}
```

- Sin `limit`, una lista devuelve `pagination.defaultLimit` filas (100 por defecto).
- Un `limit` por encima de `pagination.maxLimit` (1000 por defecto) se reduce a ese valor.
- Sin `orderBy`, las filas se ordenan por clave primaria.

Ambos límites son [opciones](/es/reference/options):

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  pagination: { defaultLimit: 50, maxLimit: 500 },
});
```

## Cursores

Cada tabla con clave primaria también obtiene una connection estilo Relay:

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

Pasa `endCursor` como `after` para obtener la página siguiente, o `startCursor` como `before` con `last` para retroceder:

```graphql
{
  blogPostsConnection(first: 20, after: "eyJ…") { edges { node { title } } pageInfo { hasNextPage endCursor } }
}
```

Los cursores son opacos: guardan los valores de los campos de `orderBy` más la clave primaria de la fila, así que las páginas siguen siendo correctas cuando se insertan filas en medio, y los empates en el orden se resuelven por clave. Los valores nulos se ordenan de forma consistente en todas las bases de datos.

Usa cursores para scroll infinito y tablas grandes; los offsets se vuelven más lentos cuanto más avanzan, los cursores no.

## Relaciones

Las listas dentro de una relación reciben los mismos `where`, `orderBy`, `limit` y `offset`:

```graphql
{
  authors {
    fullName
    blogPosts(orderBy: [{ rating: DESC }], limit: 3) { title }
  }
}
```

Sin ninguno de esos argumentos, las filas relacionadas de todos los autores se obtienen en una sola consulta en batch. Con ellos, la lista de cada autor es su propia consulta.
