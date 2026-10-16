# Mutations

Cada tabla en la que se puede escribir obtiene seis mutations.

## Crear

```graphql
mutation {
  createAuthor(input: { fullName: "Ada Lovelace", email: "ada@example.com" }) {
    id
    createdAt
  }
}
```

El input exige las columnas que son `NOT NULL` y no tienen valor por defecto. Las columnas que llena la base de datos, como las claves serial y `DEFAULT now()`, se pueden omitir, y vuelven en el resultado.

## Actualizar

```graphql
mutation {
  updateAuthor(id: 1, input: { fullName: "Ada King" }) { fullName }
}
```

Cada campo del input es opcional; solo cambian los que se indican. La clave primaria no se puede cambiar. Devuelve `null` cuando ninguna fila tiene esa clave.

## Eliminar

```graphql
mutation {
  deleteAuthor(id: 1) { email }
}
```

Devuelve la fila eliminada, o `null` cuando no había ninguna.

## Upsert

```graphql
mutation {
  upsertAuthor(input: { id: 1, fullName: "Ada", email: "ada@example.com" }) { id }
}
```

Actualiza la fila cuya clave primaria está en el input, o la crea cuando no existe.

## Batches

```graphql
mutation {
  createManyAuthors(inputs: [{ fullName: "Ada", email: "a@x.com" }, { fullName: "Alan", email: "b@x.com" }])
  deleteManyAuthors(where: { email: { contains: "@x.com" } })
}
```

Ambas devuelven cuántas filas escribieron. Rechazan más de `pagination.maxLimit` filas, así que un error en un filtro no puede eliminar una tabla entera más allá de ese límite. Los [hooks](./extending#hooks) se ejecutan para cada fila, todos en una sola transacción.

## Qué tablas admiten escritura

- Las tablas en [`readOnly`](./security#solo-lectura), y las vistas SQL, no obtienen mutations.
- Las tablas sin clave primaria obtienen solo `create` y `createMany`.
- Las tablas de unión, cuyas columnas son todas clave, no obtienen `update`.
- Si no hay nada en lo que se pueda escribir, el schema no tiene tipo `Mutation`.

## Errores

Una escritura que la base de datos rechaza, como un valor único duplicado o una clave foránea inexistente, responde `Internal server error` con un `errorId`; el mensaje de la base de datos se registra en el log bajo ese id y nunca se envía al cliente. Consulta [Seguridad](./security#errores).
