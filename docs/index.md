---
layout: home

hero:
  name: Inverse Model
  text: Your database, as a GraphQL API
  tagline: A NestJS module that reads an existing database and serves queries, mutations and relations for all of it, from just its connection string.
  image:
    src: /logo.svg
    alt: Inverse Model
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What is it?
      link: /guide/what-is-it
    - theme: alt
      text: GitHub
      link: https://github.com/nest-modules/inverse-model

features:
  - icon: 🔌
    title: One connection string
    details: PostgreSQL, MySQL, MariaDB, SQL Server or MongoDB. The protocol of the URL picks the database; nothing else to write.
  - icon: 🧭
    title: The whole API, generated
    details: Lists with filters, ordering and pagination, counts, lookups by key, create, update, delete, upsert and batch writes, for every table.
  - icon: 🔗
    title: Relations from foreign keys
    details: Every foreign key becomes a field on both sides, batched per request so lists never fall into N+1 queries.
  - icon: 🛡️
    title: Safe by default
    details: Allow and deny lists, read-only tables, query depth and cost limits, per-request authorization and row-level scopes for multi-tenant apps.
  - icon: ⚡
    title: Redis cache
    details: Query results cached with a TTL per table, and cleared table by table as soon as a mutation commits.
  - icon: 🧩
    title: Yours to extend
    details: Write hooks in the same transaction as the write, your own types and resolvers next to the generated ones, and renames.
---
