# SQL Server

```sh
npm install mssql
```

```ts
InverseModelModule.forRoot({ url: 'mssql://user:pass@host:1433/db' });
```

`sqlserver://` works too.

## Encryption

The driver encrypts connections by default and checks the server's certificate. For a server with a self-signed certificate, such as a local Docker container, trust it with a URL parameter or the `ssl` option:

```ts
InverseModelModule.forRoot({ url: 'mssql://sa:pass@localhost:1433/db?trustServerCertificate=true' });

InverseModelModule.forRoot({
  url: 'mssql://sa:pass@localhost:1433/db',
  ssl: { rejectUnauthorized: false },
});
```

`?encrypt=false` turns encryption off.

## What is read

Every table and view in every schema, with its primary and foreign keys. As on [PostgreSQL](./postgres#what-is-read), tables in the default schema (`dbo`) go by their bare name in the options, and tables in other schemas keep it (`sales.orders`); GraphQL names leave the schema out.

## Types

| Column | GraphQL |
|---|---|
| `tinyint`, `smallint`, `int` | `Int` |
| `real`, `float` | `Float` |
| `bigint`, `decimal`, `numeric`, `money` | `String`, to keep their precision |
| `bit` | `Boolean` |
| `date`, `datetime`, `datetime2`, `smalldatetime`, `datetimeoffset` | `DateTime` |
| `nvarchar`, `varchar`, `uniqueidentifier`, anything else | `String` |

## Running it locally

The official image runs on amd64 only. On Apple silicon it needs Docker with Rosetta emulation and at least 2 GB of memory; it is tested in CI on Linux.
