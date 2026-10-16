# MySQL and MariaDB

```sh
npm install mysql2
```

```ts
InverseModelModule.forRoot({ url: 'mysql://user:pass@host:3306/db' });
InverseModelModule.forRoot({ url: 'mariadb://user:pass@host:3306/db' });
```

## What is read

The tables and views of the database in the URL, with their primary and foreign keys. MySQL has no schemas inside a database, so names are never qualified.

## Types

| Column | GraphQL |
|---|---|
| `tinyint(1)`, `boolean` | `Boolean` |
| `tinyint`, `smallint`, `mediumint`, `int` | `Int` |
| `float`, `double`, `real` | `Float` |
| `bigint`, `decimal` | `String`, to keep their precision |
| `date`, `datetime`, `timestamp` | `DateTime` |
| `json` | `JSON` on MySQL; `String` on MariaDB, where `json` is an alias of `longtext` |
| `varchar`, `text`, enums, anything else | `String` |

MySQL returns booleans as `1` and `0`; the API turns them into `true` and `false`.

## Notes

- `contains` is case-insensitive whatever the column's collation.
- Ordering of text follows the column's collation, so it may differ from the other databases.
