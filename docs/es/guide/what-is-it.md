# ¿Qué es Inverse Model?

Inverse Model es un módulo de NestJS que convierte una base de datos existente en una API GraphQL. Le das una cadena de conexión; al arrancar lee cada tabla o colección, con sus columnas, claves y claves foráneas, y sirve un schema GraphQL para leer y escribir en todas ellas.

```ts
@Module({
  imports: [InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })],
})
export class AppModule {}
```

Es *database-first*: la base de datos es la fuente de verdad, y la API la sigue. No hay entidades, DTOs ni resolvers que escribir, y nunca se migra ni se sincroniza nada: la librería solo lee el schema.

## Cuándo usarlo

- **Herramientas internas y paneles de administración** que necesitan leer y editar datos que ya existen.
- **Modernizar una base de datos heredada** detrás de una API tipada sin reescribirla.
- **Prototipos** que necesitan un backend funcional en minutos.
- **Una API de datos dentro de una app NestJS existente**, junto a tus propios módulos, guards y resolvers.

## Qué genera

Para cada tabla o colección:

| | |
|---|---|
| **Queries** | Una lista con filtros, orden y `limit`/`offset`, un conteo, una búsqueda por clave primaria y una connection estilo Relay con cursores. |
| **Mutations** | Crear, actualizar, eliminar, upsert, y crear y eliminar en batch. |
| **Relaciones** | Un campo a ambos lados de cada clave foránea, incluidas las claves compuestas, agrupado en batch por petición. |

Consulta [La API generada](./generated-api) para ver su forma completa.

## Cómo se compara

Herramientas como Hasura o PostGraphile se ejecutan como un servidor aparte con su propio formato de configuración. Inverse Model es una librería que se ejecuta dentro de tu proceso NestJS, configurada en TypeScript en `forRoot`, así que comparte el ciclo de vida, la inyección de dependencias, el logging y el despliegue de tu app. También cubre bases de datos que esas herramientas soportan de forma parcial o no soportan, como SQL Server y MongoDB.

## Bases de datos soportadas

| Base de datos | URL | Driver |
|---|---|---|
| PostgreSQL | `postgres://user:pass@host:5432/db` | `pg` |
| MySQL | `mysql://user:pass@host:3306/db` | `mysql2` |
| MariaDB | `mariadb://user:pass@host:3306/db` | `mysql2` |
| SQL Server | `mssql://user:pass@host:1433/db` | `mssql` |
| MongoDB | `mongodb://host:27017/db` o `mongodb+srv://…` | `mongodb` |

Cada base de datos se prueba en CI con cada cambio, tanto directamente como a través de la API GraphQL completa en Docker. Consulta [Bases de datos](/es/databases/) para ver en qué se diferencian.
