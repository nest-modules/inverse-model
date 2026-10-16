# @nestjs-modules/inverse-generator

## 0.1.0

First release. `generateProject({ name, databaseUrl })` returns the files of a NestJS project that mounts `InverseModelModule` over the database, with the driver its protocol needs and the matching library version; `writeProject` writes them, and `databaseNameOf` validates a connection string and reads its database name.
