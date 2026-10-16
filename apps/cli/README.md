# @nestjs-modules/inverse

Writes a NestJS project that serves an existing database over GraphQL with [`@nestjs-modules/inverse-model`](https://github.com/nest-modules/inverse-model).

```sh
npx @nestjs-modules/inverse generate postgres://user:pass@localhost:5432/blog -o blog-api
cd blog-api && npm install && npm run build && npm start
```

The connection string picks the database (`postgres`, `postgresql`, `mysql`, `mariadb`, `mssql`, `sqlserver`, `mongodb`, `mongodb+srv`) and must name one in its path. The project gets the driver of that database and a `.env` with the URL.

| Option | Default | |
|---|---|---|
| `-n, --name <name>` | the database name | npm name of the project |
| `-o, --out <dir>` | the project name | Output directory; it must be empty or missing |

## License

MIT
