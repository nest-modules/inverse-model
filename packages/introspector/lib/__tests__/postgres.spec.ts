import { postgresKind } from '../drivers/postgres';

describe('postgresKind', () => {
  it.each([
    ['integer', 'int'],
    ['double precision', 'float'],
    ['bigint', 'string'],
    ['character varying', 'string'],
    ['boolean', 'boolean'],
    ['timestamp with time zone', 'datetime'],
    ['jsonb', 'json'],
    ['ARRAY', 'unknown'],
  ])('maps %s to %s', (dataType, kind) => {
    expect(postgresKind(dataType)).toBe(kind);
  });
});
