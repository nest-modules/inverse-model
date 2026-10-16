# CLI

El comando `inverse` escribe un proyecto NestJS que sirve una base de datos a través del módulo, listo para instalar y ejecutar.

```sh
npm install -g @nestjs-modules/inverse
inverse generate postgres://user:pass@localhost:5432/blog -o blog-api
cd blog-api
npm install
npm run build
npm start
```

## `inverse generate <connection-string>`

| Opción | Por defecto | Qué hace |
|---|---|---|
| `-o, --out <dir>` | el nombre del proyecto | Directorio en el que se escribe el proyecto. Debe estar vacío o no existir. |
| `-n, --name <name>` | el nombre de la base de datos | Nombre npm del proyecto. |

La cadena de conexión debe usar un protocolo soportado y nombrar una base de datos; si no, el comando explica qué está mal y termina con un error.

## Qué escribe

| Archivo | Contenido |
|---|---|
| `package.json` | NestJS, Apollo, el módulo y el driver de tu base de datos |
| `tsconfig.json` | Configuración de TypeScript para NestJS |
| `.env` | `DATABASE_URL` y `PORT` |
| `.gitignore` | `node_modules`, `dist` y `.env` |
| `src/main.ts` | Arranca la app |
| `src/app.module.ts` | Importa `InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })` |

A partir de ahí es una app NestJS normal: agrega [opciones](/es/reference/options), tus propios módulos, guards y resolvers.
