import { projectFiles } from '../templates/project';

const DATABASE_URL = 'postgres://user:secret@localhost:5432/blog';

describe('projectFiles', () => {
  const files = projectFiles('blog-api', DATABASE_URL);
  const content = (path: string) => {
    const file = files.find((candidate) => candidate.path === path);
    if (!file) {
      throw new Error(`${path} was not generated`);
    }
    return file.content;
  };
  const packageJson = (databaseUrl = DATABASE_URL) =>
    JSON.parse(
      projectFiles('blog-api', databaseUrl).find(
        (file) => file.path === 'package.json',
      )?.content ?? '{}',
    );

  it('generates the files of a NestJS project', () => {
    expect(files.map((file) => file.path)).toEqual([
      'package.json',
      'tsconfig.json',
      '.gitignore',
      '.env',
      'src/main.ts',
      'src/app.module.ts',
    ]);
  });

  describe('package.json', () => {
    const pkg = packageJson();

    it('names the project and keeps it private', () => {
      expect(pkg).toMatchObject({
        name: 'blog-api',
        version: '0.0.1',
        private: true,
      });
    });

    it('builds with tsc and starts with the .env file', () => {
      expect(pkg.scripts).toEqual({
        build: 'tsc -p tsconfig.json',
        start: 'node --env-file=.env dist/main.js',
      });
    });

    it('depends on the library and the GraphQL stack', () => {
      expect(pkg.dependencies).toMatchObject({
        '@nestjs-modules/inverse-model': '^0.0.0',
        '@apollo/server': expect.any(String),
        '@nestjs/apollo': expect.any(String),
        '@nestjs/common': expect.any(String),
        '@nestjs/core': expect.any(String),
        '@nestjs/graphql': expect.any(String),
        '@nestjs/platform-express': expect.any(String),
        graphql: expect.any(String),
        'reflect-metadata': expect.any(String),
        rxjs: expect.any(String),
        typeorm: expect.any(String),
      });
    });

    it('sorts the dependencies by name', () => {
      const names = Object.keys(pkg.dependencies);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it('builds with typescript and the node types', () => {
      expect(Object.keys(pkg.devDependencies)).toEqual([
        '@types/node',
        'typescript',
      ]);
    });

    it('ends with a newline', () => {
      expect(content('package.json').endsWith('}\n')).toBe(true);
    });
  });

  describe('database driver', () => {
    const DRIVERS = ['pg', 'mysql2', 'mongodb'];

    it.each([
      ['postgres://localhost/blog', 'pg'],
      ['postgresql://localhost/blog', 'pg'],
      ['mysql://localhost/blog', 'mysql2'],
      ['mariadb://localhost/blog', 'mysql2'],
      ['mongodb://localhost/blog', 'mongodb'],
      ['mongodb+srv://cluster.example.com/blog', 'mongodb'],
    ])('adds only the driver of %s', (databaseUrl, driver) => {
      const { dependencies } = packageJson(databaseUrl);
      expect(dependencies[driver]).toMatch(/^\d+\.\d+\.\d+$/);
      for (const other of DRIVERS.filter((name) => name !== driver)) {
        expect(dependencies).not.toHaveProperty(other);
      }
    });

    it('rejects a protocol no adapter handles', () => {
      expect(() => projectFiles('x', 'sqlite://localhost/x')).toThrow(
        'Unsupported database protocol: sqlite',
      );
    });

    it('rejects a connection string that is not a URL', () => {
      expect(() => projectFiles('x', 'not a url')).toThrow();
    });
  });

  it('compiles src into dist with decorator metadata', () => {
    const tsconfig = JSON.parse(content('tsconfig.json'));
    expect(tsconfig.include).toEqual(['src/**/*']);
    expect(tsconfig.compilerOptions).toMatchObject({
      module: 'nodenext',
      moduleResolution: 'nodenext',
      strict: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      rootDir: './src',
      outDir: './dist',
    });
  });

  it('ignores dependencies, the build and the .env file', () => {
    expect(content('.gitignore')).toBe('node_modules\ndist\n.env\n');
  });

  it('writes the connection string and port to .env', () => {
    expect(content('.env')).toBe(`DATABASE_URL=${DATABASE_URL}\nPORT=3000\n`);
  });

  it('bootstraps the app on PORT', () => {
    const main = content('src/main.ts');
    expect(main).toMatch(/^import 'reflect-metadata';/);
    expect(main).toContain('NestFactory.create(AppModule)');
    expect(main).toContain('app.listen(process.env.PORT ?? 3000)');
  });

  it('mounts InverseModelModule in the root module', () => {
    const appModule = content('src/app.module.ts');
    expect(appModule).toContain(
      "import { InverseModelModule } from '@nestjs-modules/inverse-model';",
    );
    expect(appModule).toContain(
      'imports: [InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })]',
    );
    expect(appModule).toContain('export class AppModule {}');
  });
});
