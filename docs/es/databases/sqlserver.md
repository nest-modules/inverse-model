# SQL Server

```sh
npm install mssql
```

```ts
InverseModelModule.forRoot({ url: 'mssql://user:pass@host:1433/db' });
```

`sqlserver://` también funciona.

## Cifrado

El driver cifra las conexiones por defecto y verifica el certificado del servidor. Para un servidor con un certificado autofirmado, como un contenedor local de Docker, confía en él con un parámetro de URL o con la opción `ssl`:

```ts
InverseModelModule.forRoot({ url: 'mssql://sa:pass@localhost:1433/db?trustServerCertificate=true' });

InverseModelModule.forRoot({
  url: 'mssql://sa:pass@localhost:1433/db',
  ssl: { rejectUnauthorized: false },
});
```

`?encrypt=false` desactiva el cifrado.

## Qué se lee

Cada tabla y vista de cada schema, con sus claves primarias y foráneas. Igual que en [PostgreSQL](./postgres#que-se-lee), las tablas del schema por defecto (`dbo`) se nombran solo por su nombre en las opciones, y las tablas de otros schemas lo conservan (`sales.orders`); los nombres en GraphQL omiten el schema.

## Tipos

| Columna | GraphQL |
|---|---|
| `tinyint`, `smallint`, `int` | `Int` |
| `real`, `float` | `Float` |
| `bigint`, `decimal`, `numeric`, `money` | `String`, para conservar su precisión |
| `bit` | `Boolean` |
| `date`, `datetime`, `datetime2`, `smalldatetime`, `datetimeoffset` | `DateTime` |
| `nvarchar`, `varchar`, `uniqueidentifier`, cualquier otro | `String` |

## Ejecutarlo localmente

La imagen oficial solo funciona en amd64. En Apple silicon necesita Docker con emulación Rosetta y al menos 2 GB de memoria; se prueba en CI sobre Linux.
