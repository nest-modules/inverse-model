import { findAdapter } from '../adapters/find-adapter';

describe('findAdapter', () => {
  it.each([
    ['postgres://localhost/blog', 'postgres'],
    ['postgresql://localhost/blog', 'postgres'],
    ['mysql://localhost/blog', 'mysql'],
    ['mariadb://localhost/blog', 'mariadb'],
    ['mssql://localhost/blog', 'sqlserver'],
    ['sqlserver://localhost/blog', 'sqlserver'],
    ['mongodb://localhost/blog', 'mongodb'],
    ['mongodb+srv://cluster.example.com/blog', 'mongodb'],
  ])('picks the adapter of %s', (url, name) => {
    expect(findAdapter(url).name).toBe(name);
  });

  it('lists the supported protocols for an unknown one', () => {
    expect(() => findAdapter('oracle://localhost/blog')).toThrow(
      /Unsupported database protocol: oracle \(supported: postgres, postgresql, /,
    );
  });
});
