# @nestjs-modules/inverse-generator

The files of the starter project that [`inverse generate`](https://www.npmjs.com/package/@nestjs-modules/inverse) writes: a NestJS app that mounts `InverseModelModule` over a database, with the driver of that database.

```ts
import {
  databaseNameOf,
  generateProject,
  writeProject,
} from '@nestjs-modules/inverse-generator';

const databaseUrl = 'postgres://user:pass@localhost:5432/blog';
const name = databaseNameOf(databaseUrl); // 'blog'; throws for unsupported or incomplete URLs
await writeProject(name, generateProject({ name, databaseUrl }));
```

## License

MIT
