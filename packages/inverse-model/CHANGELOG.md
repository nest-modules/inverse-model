# @nestjs-modules/inverse-model

## 0.1.0

First release. `InverseModelModule.forRoot({ url })` reads an existing database on start and serves a GraphQL API to read and write all of it, with nothing else to write.

- **Databases.** PostgreSQL (`pg`), MySQL and MariaDB (`mysql2`), SQL Server (`mssql`) and MongoDB (`mongodb`), picked from the protocol of the connection string. A missing driver fails with the package to install.
- **Queries.** A list, a count and a lookup by primary key per table or collection, with `where` filters (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, case-insensitive `contains`, `isNull`, combined with `AND`, `OR` and `NOT`), `orderBy`, `limit` and `offset`.
- **Mutations.** Create, update and delete per table; tables without a primary key are only listed and created.
- **Relations.** Each single-column foreign key gives a field on both sides, batched per request. MongoDB fields named after a collection (`author_id`, `authorId`) are read as references.
- **Names and types.** PascalCase types and camelCase fields; `bigint` and `numeric` as `String`, MySQL `tinyint(1)` as `Boolean`, JSON columns as `JSON` and dates as `DateTime`. MongoDB fields are inferred from a sample of 100 documents.
- **Options.** TLS for the connection (`ssl`), a Redis result cache with per-table TTLs that a mutation on the table clears (`cache`), default and maximum page sizes (`pagination`) and Apollo options (`graphql`).
- **`@nestjs-modules/inverse-model/drivers`.** A dependency-free table of the driver package and version each protocol needs.
