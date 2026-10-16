import { graphqlType } from '../graphql/graphql-type';

describe('graphqlType', () => {
  it.each([
    ['integer', 'Int'],
    ['double precision', 'Float'],
    ['boolean', 'Boolean'],
    ['timestamp with time zone', 'DateTime'],
    ['jsonb', 'JSON'],
    ['bigint', 'String'],
    ['character varying', 'String'],
  ])('maps %s to %s', (columnType, type) => {
    expect(graphqlType(columnType)).toBe(type);
  });
});
