import { databaseNameOf } from '../database-url';

describe('databaseNameOf', () => {
  it.each([
    ['postgres://user:secret@localhost:5432/blog', 'blog'],
    ['postgresql://localhost/blog?sslmode=require', 'blog'],
    ['MySQL://localhost:3306/inverse_blog', 'inverse_blog'],
    ['mssql://sa:pw@localhost:1433/my%20db?encrypt=false', 'my db'],
    ['mongodb+srv://cluster.example.com/blog/', 'blog'],
  ])('reads the database of %s', (url, name) => {
    expect(databaseNameOf(url)).toBe(name);
  });

  it('rejects a string that is not a URL', () => {
    expect(() => databaseNameOf('localhost/blog')).toThrow(
      'The connection string is not a URL',
    );
  });

  it('rejects an unsupported protocol', () => {
    expect(() => databaseNameOf('oracle://localhost/blog')).toThrow(
      /Unsupported database protocol: oracle \(supported: postgres, /,
    );
  });

  it.each([
    'postgres://localhost:5432',
    'postgres://localhost:5432/',
    'mongodb://localhost/a/b',
  ])('rejects %s, which names no database', (url) => {
    expect(() => databaseNameOf(url)).toThrow(
      'The connection string names no database',
    );
  });
});
