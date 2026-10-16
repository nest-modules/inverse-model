# Supported databases

The protocol of the connection string picks the database. Install its driver next to the module.

| Database | Protocols | Driver | Tested on |
|---|---|---|---|
| [PostgreSQL](./postgres) | `postgres://`, `postgresql://` | `pg` | 17 |
| [MySQL](./mysql) | `mysql://` | `mysql2` | 8.4 |
| [MariaDB](./mysql) | `mariadb://` | `mysql2` | 11.4 |
| [SQL Server](./sqlserver) | `mssql://`, `sqlserver://` | `mssql` | 2022 |
| [MongoDB](./mongodb) | `mongodb://`, `mongodb+srv://` | `mongodb` | 8.0 |

## Feature matrix

| | PostgreSQL | MySQL | MariaDB | SQL Server | MongoDB |
|---|---|---|---|---|---|
| Queries, filters, ordering, pagination | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create, update, delete, upsert, batches | ✅ | ✅ | ✅ | ✅ | ✅ |
| Relations | from foreign keys | from foreign keys | from foreign keys | from foreign keys | inferred from names and DBRefs |
| Composite keys | ✅ | ✅ | ✅ | ✅ | — |
| Views (read-only) | ✅ | ✅ | ✅ | ✅ | — |
| Transactions for hooks | ✅ | ✅ | ✅ | ✅ | with a replica set |
| Schema | read from the catalog | read from the catalog | read from the catalog | read from the catalog | inferred from 100 sampled documents per collection |

Every database runs the same integration tests and the same end-to-end GraphQL test in CI on every change.

## Connection strings

Driver parameters in the URL are passed to the driver, e.g. `?sslmode=require` on PostgreSQL or `?trustServerCertificate=true` on SQL Server. Passwords with special characters must be URL-encoded.

## TLS

The `ssl` option turns TLS on for any database:

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  ssl: true, // the driver's defaults
});

InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.DB_CA_CERT, // PEM contents, not file paths
    cert: process.env.DB_CLIENT_CERT,
    key: process.env.DB_CLIENT_KEY,
  },
});
```

`rejectUnauthorized: false` accepts self-signed or otherwise unverified server certificates; use it only for development.

## Run them locally

The repository's `compose.yaml` starts every database with the blog sample loaded:

```sh
docker compose up -d --wait postgres mysql mariadb sqlserver mongodb redis
```

The SQL Server image is published for amd64 only; on Apple silicon it needs Docker with Rosetta and at least 2 GB of memory.
