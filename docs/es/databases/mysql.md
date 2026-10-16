# MySQL y MariaDB

```sh
npm install mysql2
```

```ts
InverseModelModule.forRoot({ url: 'mysql://user:pass@host:3306/db' });
InverseModelModule.forRoot({ url: 'mariadb://user:pass@host:3306/db' });
```

## Qué se lee

Las tablas y vistas de la base de datos de la URL, con sus claves primarias y foráneas. MySQL no tiene schemas dentro de una base de datos, así que los nombres nunca se califican.

## Tipos

| Columna | GraphQL |
|---|---|
| `tinyint(1)`, `boolean` | `Boolean` |
| `tinyint`, `smallint`, `mediumint`, `int` | `Int` |
| `float`, `double`, `real` | `Float` |
| `bigint`, `decimal` | `String`, para conservar su precisión |
| `date`, `datetime`, `timestamp` | `DateTime` |
| `json` | `JSON` en MySQL; `String` en MariaDB, donde `json` es un alias de `longtext` |
| `varchar`, `text`, enums, cualquier otro | `String` |

MySQL devuelve los booleanos como `1` y `0`; la API los convierte en `true` y `false`.

## Notas

- `contains` no distingue mayúsculas de minúsculas, sea cual sea la collation de la columna.
- El orden del texto sigue la collation de la columna, así que puede diferir del de las otras bases de datos.
