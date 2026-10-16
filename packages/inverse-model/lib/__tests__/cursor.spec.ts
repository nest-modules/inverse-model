import type { ModelDefinition } from '../adapters/database-adapter.interface';
import {
  afterCursor,
  cursorOrder,
  decodeCursor,
  encodeCursor,
  reverseOrder,
} from '../graphql/cursor';

const posts: ModelDefinition = {
  name: 'Posts',
  source: 'posts',
  fields: [
    {
      name: 'id',
      property: 'id',
      type: 'Int',
      isArray: false,
      isNullable: false,
      hasDefault: true,
    },
    {
      name: 'rating',
      property: 'rating',
      type: 'Float',
      isArray: false,
      isNullable: true,
      hasDefault: false,
    },
    {
      name: 'created_at',
      property: 'createdAt',
      type: 'DateTime',
      isArray: false,
      isNullable: false,
      hasDefault: true,
    },
  ],
  primaryKey: ['id'],
  relations: [],
};

describe('cursors', () => {
  it('sort by the order asked for, then the primary key', () => {
    expect(cursorOrder(posts, [{ rating: 'DESC' }, { id: 'DESC' }])).toEqual([
      ['rating', 'DESC'],
      ['id', 'DESC'],
    ]);
    expect(cursorOrder(posts, null)).toEqual([['id', 'ASC']]);
    expect(reverseOrder([['rating', 'DESC']])).toEqual([['rating', 'ASC']]);
  });

  it('round-trip the values of a record, dates included', () => {
    const order = cursorOrder(posts, [{ createdAt: 'ASC' }]);
    const createdAt = new Date('2026-01-02T03:04:05.006Z');
    const cursor = encodeCursor(order, { id: 7, createdAt, rating: 1 });
    expect(decodeCursor(cursor, order, posts)).toEqual([createdAt, 7]);
    expect(() => decodeCursor(cursor, [['id', 'ASC']], posts)).toThrow(
      /Invalid cursor/,
    );
    expect(() => decodeCursor('not a cursor', order, posts)).toThrow(
      /Invalid cursor/,
    );
  });

  it('continue past a value, then break ties on the next properties', () => {
    const order = cursorOrder(posts, [{ rating: 'ASC' }]);
    expect(afterCursor(posts, order, [4, 7], true)).toEqual({
      OR: [
        { AND: [{ rating: { gt: 4 } }] },
        { AND: [{ rating: { eq: 4 } }, { id: { gt: 7 } }] },
      ],
    });
  });

  it('place nulls where the database sorts them', () => {
    const order = cursorOrder(posts, [{ rating: 'ASC' }]);
    // Nulls first: after a null come the other nulls by id, then every value.
    expect(afterCursor(posts, order, [null, 7], true)).toEqual({
      OR: [
        { AND: [{ rating: { isNull: false } }] },
        { AND: [{ rating: { isNull: true } }, { id: { gt: 7 } }] },
      ],
    });
    // Nulls last: nulls follow every value.
    expect(afterCursor(posts, order, [4, 7], false).OR?.[0]).toEqual({
      AND: [{ OR: [{ rating: { gt: 4 } }, { rating: { isNull: true } }] }],
    });
    // Past the last id nothing remains.
    expect(afterCursor(posts, [['rating', 'ASC']], [null], false)).toEqual({
      id: { in: [] },
    });
  });
});
