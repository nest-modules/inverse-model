import type { GeneratedFile } from '../generate-project';
import type { EntityNames } from './entity';

const DEPENDENCIES = {
  '@apollo/server': '5.5.1',
  '@as-integrations/express5': '1.1.2',
  '@nestjs/apollo': '14.0.3',
  '@nestjs/common': '12.1.3',
  '@nestjs/core': '12.1.3',
  '@nestjs/graphql': '14.0.3',
  '@nestjs/platform-express': '12.1.3',
  graphql: '17.0.2',
  pg: '8.23.1',
  'reflect-metadata': '0.2.2',
  rxjs: '7.8.2',
};

const DEV_DEPENDENCIES = {
  '@types/node': '24.19.2',
  '@types/pg': '8.23.1',
  typescript: '6.0.3',
};

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Package files, bootstrap and root module of the generated project. */
export function projectFiles(
  name: string,
  databaseUrl: string,
  entities: EntityNames[],
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
        dependencies: DEPENDENCIES,
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
    { path: 'src/app.resolver.ts', content: appResolverFile() },
    { path: 'src/app.module.ts', content: appModuleFile(entities) },
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

// GraphQL requires a Query root type; the entry points of the API are the create mutations.
const appResolverFile =
  () => `import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class AppResolver {
  @Query(() => String)
  health(): string {
    return 'ok';
  }
}
`;

function appModuleFile(entities: EntityNames[]): string {
  const imports = entities.map(
    ({ className, fileName }) =>
      `import { ${className}Module } from './${fileName}/${fileName}.module';`,
  );
  const modules = entities.map(({ className }) => `    ${className}Module,`);
  return `import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { AppResolver } from './app.resolver';
import { DatabaseModule } from './database/database.module';
${imports.join('\n')}

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
    }),
    DatabaseModule,
${modules.join('\n')}
  ],
  providers: [AppResolver],
})
export class AppModule {}
`;
}
