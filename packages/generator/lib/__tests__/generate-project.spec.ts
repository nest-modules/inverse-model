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
});
