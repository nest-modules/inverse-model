# La API generada

Cada tabla o colección se convierte en un tipo GraphQL con sus queries y mutations. Los ejemplos de estas páginas usan este schema:

```sql
CREATE TABLE authors (
  id         serial PRIMARY KEY,
  full_name  text NOT NULL,
  email      varchar(255) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blog_posts (
  id         bigserial PRIMARY KEY,
  author_id  integer NOT NULL REFERENCES authors (id),
  title      text NOT NULL,
  body       text,
  published  boolean NOT NULL DEFAULT false,
  rating     double precision,
  metadata   jsonb
);
```

## Tipos

```graphql
type Author {
  id: Int!
  fullName: String!
  email: String!
  createdAt: DateTime!
  blogPosts(where: BlogPostWhere, orderBy: [BlogPostOrderBy!], limit: Int, offset: Int): [BlogPost!]!
}

type BlogPost {
  id: String!        # bigint conserva su precisión como String
  authorId: Int!
  title: String!
  body: String
  published: Boolean!
  rating: Float
  metadata: JSON
  author: Author
}
```

Una columna `NOT NULL` es no nula en el tipo. Cada tipo también obtiene un input `…Where` para [filtros](./filters), un input `…OrderBy` para [ordenar](./filters#orden), e inputs `Create…Input` / `Update…Input` para [mutations](./mutations).

## Queries

```graphql
type Query {
  authors(where: AuthorWhere, orderBy: [AuthorOrderBy!], limit: Int, offset: Int): [Author!]!
  authorsCount(where: AuthorWhere): Int!
  author(id: Int!): Author
  authorsConnection(where: AuthorWhere, orderBy: [AuthorOrderBy!], first: Int, after: String, last: Int, before: String): AuthorConnection!
  # … lo mismo para BlogPost
}
```

| Query | Devuelve |
|---|---|
| `authors` | Una página de filas. Consulta [Paginación](./pagination). |
| `authorsCount` | Cuántas filas coinciden con el filtro. |
| `author(id:)` | La fila con esa clave primaria, o `null`. Una clave compuesta recibe un argumento por columna. |
| `authorsConnection` | Una connection estilo Relay con cursores y `totalCount`. Consulta [Paginación](./pagination#cursores). |

## Mutations

```graphql
type Mutation {
  createAuthor(input: CreateAuthorInput!): Author!
  updateAuthor(id: Int!, input: UpdateAuthorInput!): Author
  deleteAuthor(id: Int!): Author
  upsertAuthor(input: CreateAuthorInput!): Author!
  createManyAuthors(inputs: [CreateAuthorInput!]!): Int!
  deleteManyAuthors(where: AuthorWhere!): Int!
}
```

Consulta [Mutations](./mutations).

## Qué depende del schema

| La tabla tiene | Obtiene |
|---|---|
| Una clave primaria | Todo lo anterior. |
| Ninguna clave primaria | Solo una lista, un conteo, `create` y `createMany`: no hay clave para buscar, actualizar, eliminar ni paginar por cursor. |
| Solo columnas de clave (una tabla de unión) | Ningún `update`, ya que no hay nada más que cambiar. |
| Claves foráneas | [Relaciones](./relations) a ambos lados. |

Las vistas SQL se exponen como solo lectura. Consulta [Vistas](./relations#vistas).

## Scalars

| Scalar | Valores |
|---|---|
| `DateTime` | Cadenas ISO 8601, p. ej. `2026-10-16T13:45:00.000Z`. |
| `JSON` | Cualquier valor JSON, para columnas `json` y `jsonb` y campos de MongoDB de tipo mixto. |

El mapeo completo desde los tipos de columna de la base de datos está en [Mapeo de tipos](/es/reference/type-mapping).

## Una query `health`

El schema siempre tiene una query `health: String!` que responde `"ok"`. GraphQL exige un tipo `Query`, y esto mantiene el schema válido incluso para una base de datos sin tablas. También sirve como un health check barato.
