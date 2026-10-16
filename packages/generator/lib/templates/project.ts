import type { GeneratedFile } from '../generate-project';

const DEPENDENCIES = {
  '@nestjs-modules/inverse-model': '^0.0.0',
  '@apollo/server': '5.5.1',
  '@as-integrations/express5': '1.1.2',
  '@nestjs/apollo': '14.0.3',
  '@nestjs/common': '12.1.3',
  '@nestjs/core': '12.1.3',
  '@nestjs/graphql': '14.0.3',
  '@nestjs/platform-express': '12.1.3',
  graphql: '17.0.2',
  'reflect-metadata': '0.2.2',
  rxjs: '7.8.2',
  typeorm: '1.1.2',
};

const POSTGRES_DRIVER = { pg: '8.23.1' };
const MYSQL_DRIVER = { mysql2: '3.24.6' };
const MONGODB_DRIVER = { mongodb: '7.7.0' };

// The driver package each adapter of the library loads.
const DRIVERS: Record<string, Record<string, string>> = {
  postgres: POSTGRES_DRIVER,
  postgresql: POSTGRES_DRIVER,
  mysql: MYSQL_DRIVER,
  mariadb: MYSQL_DRIVER,
  mongodb: MONGODB_DRIVER,
  'mongodb+srv': MONGODB_DRIVER,
};

function driverOf(databaseUrl: string) {
  const protocol = new URL(databaseUrl).protocol.replace(/:$/, '');
  const driver = DRIVERS[protocol];
  if (!driver) {
    throw new Error(`Unsupported database protocol: ${protocol}`);
  }
  return driver;
}

const DEV_DEPENDENCIES = {
  '@types/node': '24.19.2',
  typescript: '6.0.3',
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Package files, bootstrap and root module of the generated project. */
export function projectFiles(
  name: string,
  databaseUrl: string,
): GeneratedFile[] {
  return [
    {
      path: 'package.json',
      content: json({
        name,
        version: '0.0.1',
        private: true,
        scripts: {
          build: 'tsc -p tsconfig.json',
          start: 'node --env-file=.env dist/main.js',
        },
        dependencies: Object.fromEntries(
          Object.entries({ ...DEPENDENCIES, ...driverOf(databaseUrl) }).sort(
            ([a], [b]) => a.localeCompare(b),
          ),
        ),
        devDependencies: DEV_DEPENDENCIES,
      }),
    },
    {
      path: 'tsconfig.json',
      content: json({
        compilerOptions: {
          target: 'ES2023',
          lib: ['ES2023'],
          module: 'nodenext',
          moduleResolution: 'nodenext',
          types: ['node'],
          strict: true,
          strictPropertyInitialization: false,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          skipLibCheck: true,
          rootDir: './src',
          outDir: './dist',
        },
        include: ['src/**/*'],
      }),
    },
    { path: '.gitignore', content: 'node_modules\ndist\n.env\n' },
    { path: '.env', content: `DATABASE_URL=${databaseUrl}\nPORT=3000\n` },
    { path: 'src/main.ts', content: mainFile() },
    { path: 'src/app.module.ts', content: appModuleFile() },
  ];
}

const mainFile = () => `import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
`;

const appModuleFile =
  () => `import { InverseModelModule } from '@nestjs-modules/inverse-model';
import { Module } from '@nestjs/common';

@Module({
  imports: [InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })],
})
export class AppModule {}
`;
