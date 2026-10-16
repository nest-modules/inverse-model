import { generateProject } from '../generate-project';

describe('generateProject', () => {
  const files = generateProject({
    name: 'blog-api',
    databaseUrl: 'postgres://localhost/blog',
  });
  const content = (path: string) =>
    files.find((file) => file.path === path)?.content;

  it('mounts InverseModelModule with the connection string', () => {
    expect(content('src/app.module.ts')).toContain(
      'InverseModelModule.forRoot({ url: process.env.DATABASE_URL! })',
    );
    expect(content('.env')).toContain('DATABASE_URL=postgres://localhost/blog');
  });

  it.each([
    ['postgres://localhost/blog', 'pg'],
    ['mysql://localhost/blog', 'mysql2'],
    ['mssql://localhost/blog', 'mssql'],
    ['mongodb+srv://cluster.example.com/blog', 'mongodb'],
  ])('adds the driver of %s', (databaseUrl, driver) => {
    const pkg = generateProject({ name: 'blog-api', databaseUrl }).find(
      (file) => file.path === 'package.json',
    );
    expect(
      Object.keys(JSON.parse(pkg?.content ?? '{}').dependencies),
    ).toContain(driver);
  });

  it('rejects a database no adapter handles', () => {
    expect(() =>
      generateProject({ name: 'x', databaseUrl: 'oracle://localhost/x' }),
    ).toThrow('Unsupported database protocol: oracle');
  });
});
