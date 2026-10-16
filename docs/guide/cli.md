# CLI

The `inverse` command writes a NestJS project that serves a database through the module, ready to install and run.

```sh
npm install -g @nestjs-modules/inverse
inverse generate postgres://user:pass@localhost:5432/blog -o blog-api
cd blog-api
npm install
npm run build
npm start
```

## `inverse generate <connection-string>`

| Option | Default | What it does |
|---|---|---|
| `-o, --out <dir>` | the project name | Directory to write the project to. It must be empty or not exist. |
| `-n, --name <name>` | the database name | npm name of the project. |

The connection string must use a supported protocol and name a database; otherwise the command explains what is wrong and exits with an error.

## What it writes

| File | Contents |
|---|---|
| `package.json` | NestJS, Apollo, the module, and the driver of your database |
| `tsconfig.json` | TypeScript settings for NestJS |
| `.env` | `DATABASE_URL` and `PORT` |
| `.gitignore` | `node_modules`, `dist` and `.env` |
| `src/main.ts` | Starts the app |
| `src/app.module.ts` | Imports `InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })` |

From there it's a regular NestJS app: add [options](/reference/options), your own modules, guards and resolvers.
