import { whereSql } from '../adapters/sql/where-sql';

describe('whereSql', () => {
  it('matches everything without a filter', () => {
    expect(whereSql(undefined, 't')).toEqual({ sql: '1 = 1', parameters: {} });
  });

  it('turns comparisons into parameters', () => {
    expect(whereSql({ views: { gte: 10, lt: 20 } }, 't')).toEqual({
      sql: 't.views >= :p0 AND t.views < :p1',
      parameters: { p0: 10, p1: 20 },
    });
  });

  it('expands in, and matches nothing for an empty list', () => {
    expect(whereSql({ id: { in: [1, 2] } }, 't')).toEqual({
      sql: 't.id IN (:...p0)',
      parameters: { p0: [1, 2] },
    });
    expect(whereSql({ id: { in: [] } }, 't').sql).toBe('1 = 0');
  });

  it('escapes LIKE wildcards in contains', () => {
    expect(whereSql({ title: { contains: '50%_off' } }, 't')).toEqual({
      sql: "LOWER(t.title) LIKE :p0 ESCAPE '!'",
      parameters: { p0: '%50!%!_off%' },
    });
  });

  it('checks for null', () => {
    expect(whereSql({ body: { isNull: true } }, 't').sql).toBe(
      't.body IS NULL',
    );
    expect(whereSql({ body: { isNull: false } }, 't').sql).toBe(
      't.body IS NOT NULL',
    );
  });

  it('nests AND, OR and NOT', () => {
    const { sql, parameters } = whereSql(
      {
        OR: [{ views: { eq: 1 } }, { views: { eq: 2 } }],
        NOT: { title: { eq: 'Draft' } },
      },
      't',
    );
    expect(sql).toBe(
      '(t.views = :p0 OR t.views = :p1) AND NOT (t.title = :p2)',
    );
    expect(parameters).toEqual({ p0: 1, p1: 2, p2: 'Draft' });
  });

  it('skips null values the API sends for unset arguments', () => {
    expect(whereSql({ views: { eq: null, gt: 1 }, AND: null }, 't')).toEqual({
      sql: 't.views > :p0',
      parameters: { p0: 1 },
    });
  });
});
