---
layout: home

hero:
  name: Inverse Model
  text: Tu base de datos, como una API GraphQL
  tagline: Un módulo de NestJS que lee una base de datos existente y sirve queries, mutations y relaciones para toda ella, con solo su cadena de conexión.
  image:
    src: /logo.svg
    alt: Inverse Model
  actions:
    - theme: brand
      text: Empezar
      link: /es/guide/getting-started
    - theme: alt
      text: ¿Qué es?
      link: /es/guide/what-is-it
    - theme: alt
      text: GitHub
      link: https://github.com/nest-modules/inverse-model

features:
  - icon: 🔌
    title: Una cadena de conexión
    details: PostgreSQL, MySQL, MariaDB, SQL Server o MongoDB. El protocolo de la URL elige la base de datos; no hay nada más que escribir.
  - icon: 🧭
    title: Toda la API, generada
    details: Listas con filtros, orden y paginación, conteos, búsquedas por clave, create, update, delete, upsert y escrituras en batch, para cada tabla.
  - icon: 🔗
    title: Relaciones a partir de claves foráneas
    details: Cada clave foránea se convierte en un campo en ambos lados, agrupado en batch por petición para que las listas nunca caigan en queries N+1.
  - icon: 🛡️
    title: Seguro por defecto
    details: Listas de permitidos y bloqueados, tablas de solo lectura, límites de profundidad y costo de queries, autorización por petición y scopes a nivel de fila para apps multi-tenant.
  - icon: ⚡
    title: Cache en Redis
    details: Resultados de queries en cache con un TTL por tabla, que se limpian tabla por tabla en cuanto una mutation se confirma.
  - icon: 🧩
    title: Tuyo para extender
    details: Hooks de escritura en la misma transacción que la escritura, tus propios tipos y resolvers junto a los generados, y renombres.
---
