# Mapeo de tipos

Cómo los tipos de columna de cada base de datos se convierten en tipos GraphQL. Una columna `NOT NULL` es non-null (`Int!`); en los inputs, es obligatoria salvo que la base de datos la complete.

| GraphQL | PostgreSQL | MySQL / MariaDB | SQL Server | MongoDB |
|---|---|---|---|---|
| `Int` | `smallint`, `integer` | `tinyint`, `smallint`, `mediumint`, `int` | `tinyint`, `smallint`, `int` | enteros |
| `Float` | `real`, `double precision` | `float`, `double`, `real` | `real`, `float` | números con decimales |
| `Boolean` | `boolean` | `boolean`, `tinyint(1)` | `bit` | booleanos |
| `DateTime` | `date`, `timestamp`, `timestamptz` | `date`, `datetime`, `timestamp` | `date`, `datetime`, `datetime2`, `smalldatetime`, `datetimeoffset` | fechas |
| `JSON` | `json`, `jsonb` | `json` (MySQL) | — | objetos, arrays, tipos mixtos |
| `ID` | — | — | — | ObjectIds |
| `String` | todo lo demás | todo lo demás | todo lo demás | strings, `Decimal128`, `Long` |

## Por qué `bigint` es un `String`

Los valores `bigint`, `numeric` y `decimal` pueden superar lo que un número de JavaScript representa con exactitud, así que los drivers los devuelven como strings y la API los mantiene así. Por eso una clave `bigserial` es `id: String!`, y un filtro sobre ella recibe strings: `{ id: { eq: "42" } }`.

## Arrays

Los arrays de PostgreSQL se convierten en listas del tipo de su elemento, como `[String]`. Solo se pueden filtrar con `isNull`, y no se puede ordenar por ellos.

## `DateTime`

Los valores se serializan como strings ISO 8601 en UTC (`2026-10-16T13:45:00.000Z`), y los inputs aceptan cualquier string ISO 8601.

## `JSON`

Cualquier valor JSON, guardado y devuelto tal cual. Los campos JSON solo se pueden filtrar con `isNull`, y no se puede ordenar por ellos.
