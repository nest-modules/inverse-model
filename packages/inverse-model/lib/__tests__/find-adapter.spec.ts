import type { DatabaseAdapter } from '../adapters/database-adapter.interface';
import { findAdapter } from '../adapters/find-adapter';

describe('findAdapter', () => {
  it.each([
    ['postgres://localhost/blog', 'postgres'],
    ['postgresql://localhost/blog', 'postgres'],
    ['mysql://localhost/blog', 'mysql'],
    ['mariadb://localhost/blog', 'mariadb'],
    ['mongodb://localhost/blog', 'mongodb'],
    ['mongodb+srv://cluster.example.com/blog', 'mongodb'],
  ])('picks the adapter of %s', (url, name) => {
    expect(findAdapter(url).name).toBe(name);
  });

  it('prefers custom adapters over the built-in ones', () => {
    const custom: DatabaseAdapter = {
      name: 'custom-postgres',
      protocols: ['postgres'],
      connect: jest.fn(),
    };
    expect(findAdapter('postgres://localhost/blog', [custom])).toBe(custom);
  });

  it('lists the supported protocols for an unknown one', () => {
    expect(() => findAdapter('sqlserver://localhost/blog')).toThrow(
      /Unsupported database protocol: sqlserver \(supported: postgres, postgresql, /,
    );
  });
});
