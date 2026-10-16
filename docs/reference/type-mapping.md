# Type mapping

How each database's column types become GraphQL types. A column that is `NOT NULL` is non-null (`Int!`); in inputs, it's required unless the database fills it in.

| GraphQL | PostgreSQL | MySQL / MariaDB | SQL Server | MongoDB |
|---|---|---|---|---|
| `Int` | `smallint`, `integer` | `tinyint`, `smallint`, `mediumint`, `int` | `tinyint`, `smallint`, `int` | integers |
| `Float` | `real`, `double precision` | `float`, `double`, `real` | `real`, `float` | numbers with decimals |
| `Boolean` | `boolean` | `boolean`, `tinyint(1)` | `bit` | booleans |
| `DateTime` | `date`, `timestamp`, `timestamptz` | `date`, `datetime`, `timestamp` | `date`, `datetime`, `datetime2`, `smalldatetime`, `datetimeoffset` | dates |
| `JSON` | `json`, `jsonb` | `json` (MySQL) | — | objects, arrays, mixed types |
| `ID` | — | — | — | ObjectIds |
| `String` | everything else | everything else | everything else | strings, `Decimal128`, `Long` |

## Why `bigint` is a `String`

`bigint`, `numeric` and `decimal` values can exceed what a JavaScript number holds exactly, so drivers return them as strings and the API keeps them that way. A `bigserial` key is therefore `id: String!`, and a filter on it takes strings: `{ id: { eq: "42" } }`.

## Arrays

PostgreSQL arrays become lists of their element type, such as `[String]`. They can be filtered with `isNull` only, and can't be ordered by.

## `DateTime`

Values are serialized as ISO 8601 strings in UTC (`2026-10-16T13:45:00.000Z`), and inputs accept any ISO 8601 string.

## `JSON`

Any JSON value, stored and returned as is. JSON fields can be filtered with `isNull` only, and can't be ordered by.
