# MongoDB

```sh
npm install mongodb
```

```ts
InverseModelModule.forRoot({ url: 'mongodb://host:27017/db' });
InverseModelModule.forRoot({ url: 'mongodb+srv://user:pass@cluster.example.net/db' });
```

La base de datos es la que aparece en la ruta de la URL.

## Schema inferido

Una colección no tiene schema, así que sus campos se infieren de una muestra de 100 documentos, leída cuando la app inicia:

| Valores | GraphQL |
|---|---|
| strings | `String` |
| enteros | `Int` |
| números con decimales, o una mezcla de enteros y decimales | `Float` |
| booleanos | `Boolean` |
| fechas | `DateTime` |
| ObjectIds | `ID` |
| `Decimal128`, `Long` y otros tipos BSON | `String`, para conservar su precisión |
| objetos y arrays | `JSON` |
| valores de tipos distintos en documentos distintos | `JSON` |

- `_id` se convierte en `id: ID!`, y es la clave primaria.
- Todos los demás campos son opcionales, ya que cualquier documento puede omitirlos.
- Un campo que es `null` en todos los documentos de la muestra se omite.
- Un campo que solo aparece en documentos fuera de la muestra no está en la API. Reinicia la app después de agregar campos para que aparezcan.

## Referencias

MongoDB no tiene claves foráneas, así que las referencias se infieren:

- Un campo de id llamado `author_id` o `authorId` referencia la colección `author` o `authors`, y `category_id` referencia `categories`.
- Un DBRef referencia la colección que nombra.
- Un array de ids llamado `tag_ids` o `tagIds` es una lista de `tags`.

Cada referencia se convierte en una [relación](/es/guide/relations) en ambos lados. Los ids se pasan y se devuelven como strings hexadecimales; la API los convierte en ObjectIds.

## Transacciones

Los [hooks](/es/guide/extending#hooks) se ejecutan en una transacción solo en un replica set o en un clúster con sharding; un replica set de un solo nodo es suficiente. En un servidor standalone, `transaction.active` es `false` y cada escritura se aplica por separado. Agrega `?directConnection=true` a la URL para conectarte a un replica set de un solo nodo desde fuera de su red.
