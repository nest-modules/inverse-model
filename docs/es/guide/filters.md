# Filtros y orden

## Filtros

Cada lista, conteo, connection y `deleteMany` recibe un argumento `where`. Cada campo del tipo tiene un input de filtro que depende de su tipo:

| Filtro | Operadores | Se usa para |
|---|---|---|
| `IntFilter`, `FloatFilter` | `eq` `ne` `gt` `gte` `lt` `lte` `in` `isNull` | Números |
| `DateTimeFilter` | `eq` `ne` `gt` `gte` `lt` `lte` `isNull` | Fechas y timestamps |
| `StringFilter` | `eq` `ne` `in` `contains` `isNull` | Texto, y columnas `bigint`/`numeric` |
| `BooleanFilter` | `eq` `ne` `isNull` | Booleanos |
| `IDFilter` | `eq` `ne` `in` `isNull` | Ids de MongoDB |
| `NullFilter` | `isNull` | Valores JSON y arrays |

`contains` busca una subcadena sin distinguir mayúsculas de minúsculas. `isNull: true` coincide con las filas donde el campo es nulo (o, en MongoDB, no existe).

Todas las condiciones sobre un campo deben cumplirse, y también las condiciones sobre campos distintos:

```graphql
{
  blogPosts(where: { rating: { gte: 3, lt: 5 }, published: { eq: true } }) {
    title
  }
}
```

### AND, OR y NOT

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

### Filtrar por una relación

Una relación hacia una fila filtra por los campos de esa fila:

```graphql
{
  blogPosts(where: { author: { fullName: { contains: "ada" } } }) { title }
}
```

Una relación hacia muchas filas recibe `some`, `none` o `every`:

```graphql
{
  authors(where: { blogPosts: { some: { published: { eq: true } } } }) { fullName }
}
```

`every` es verdadero para una fila sin ninguna fila relacionada. En las bases de datos SQL se compilan a subconsultas `EXISTS`; en MongoDB primero se leen los ids relacionados.

## Orden

`orderBy` recibe una lista; las entradas anteriores tienen prioridad:

```graphql
{
  blogPosts(orderBy: [{ published: DESC }, { rating: DESC }]) { title }
}
```

Cada entrada nombra un campo con `ASC` o `DESC`. No se puede ordenar por campos JSON ni arrays. Sin `orderBy`, las filas vienen ordenadas por clave primaria, así que las páginas son estables.
