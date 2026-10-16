# Bases de datos compatibles

El protocolo de la cadena de conexión elige la base de datos. Instala su driver junto al módulo.

| Base de datos | Protocolos | Driver | Probado en |
|---|---|---|---|
| [PostgreSQL](./postgres) | `postgres://`, `postgresql://` | `pg` | 17 |
| [MySQL](./mysql) | `mysql://` | `mysql2` | 8.4 |
| [MariaDB](./mysql) | `mariadb://` | `mysql2` | 11.4 |
| [SQL Server](./sqlserver) | `mssql://`, `sqlserver://` | `mssql` | 2022 |
| [MongoDB](./mongodb) | `mongodb://`, `mongodb+srv://` | `mongodb` | 8.0 |

## Matriz de funcionalidades

| | PostgreSQL | MySQL | MariaDB | SQL Server | MongoDB |
|---|---|---|---|---|---|
| Queries, filtros, orden, paginación | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create, update, delete, upsert, batches | ✅ | ✅ | ✅ | ✅ | ✅ |
| Relaciones | a partir de claves foráneas | a partir de claves foráneas | a partir de claves foráneas | a partir de claves foráneas | inferidas de nombres y DBRefs |
| Claves compuestas | ✅ | ✅ | ✅ | ✅ | — |
| Vistas (solo lectura) | ✅ | ✅ | ✅ | ✅ | — |
| Transacciones para hooks | ✅ | ✅ | ✅ | ✅ | con un replica set |
| Schema | leído del catálogo | leído del catálogo | leído del catálogo | leído del catálogo | inferido de 100 documentos muestreados por colección |

Cada base de datos ejecuta los mismos tests de integración y el mismo test end-to-end de GraphQL en CI con cada cambio.

## Cadenas de conexión

Los parámetros del driver en la URL se pasan al driver, por ejemplo `?sslmode=require` en PostgreSQL o `?trustServerCertificate=true` en SQL Server. Las contraseñas con caracteres especiales deben ir codificadas para URL.

## TLS

La opción `ssl` activa TLS en cualquier base de datos:

```ts
InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  ssl: true, // los valores por defecto del driver
});

InverseModelModule.forRoot({
  url: process.env.DATABASE_URL!,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.DB_CA_CERT, // contenido PEM, no rutas de archivo
    cert: process.env.DB_CLIENT_CERT,
    key: process.env.DB_CLIENT_KEY,
  },
});
```

`rejectUnauthorized: false` acepta certificados de servidor autofirmados o no verificados por otro motivo; úsalo solo en desarrollo.

## Ejecútalas localmente

El `compose.yaml` del repositorio inicia cada base de datos con el ejemplo del blog cargado:

```sh
docker compose up -d --wait postgres mysql mariadb sqlserver mongodb redis
```

La imagen de SQL Server se publica solo para amd64; en Apple silicon necesita Docker con Rosetta y al menos 2 GB de memoria.
