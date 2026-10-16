import type { ModelDefinition } from '../adapters/database-adapter.interface';
import { addRelations } from '../adapters/relations';
import { type RelationScope, whereSql } from '../adapters/sql/where-sql';

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

  describe('relation filters', () => {
    const model = (
      name: string,
      columns: Record<string, string>,
    ): ModelDefinition => ({
      name,
      source: name.toLowerCase(),
      fields: Object.entries(columns).map(([property, column]) => ({
        name: column,
        property,
        type: 'String',
        isArray: false,
        isNullable: false,
        hasDefault: false,
      })),
      primaryKey: ['id'],
      relations: [],
    });
    const authors = model('Authors', { id: 'id', fullName: 'full_name' });
    const posts = model('Posts', {
      id: 'id',
      authorId: 'author_id',
      title: 'title',
    });
    const reviews = model('Reviews', {
      id: 'id',
      bookId: 'book_id',
      edition: 'edition',
    });
    const editions = model('Editions', {
      bookId: 'book_id',
      edition: 'edition',
    });
    addRelations([
      {
        source: posts,
        fields: ['authorId'],
        target: authors,
        references: ['id'],
      },
      {
        source: reviews,
        fields: ['bookId', 'edition'],
        target: editions,
        references: ['bookId', 'edition'],
      },
    ]);
    const scope = (on: ModelDefinition): RelationScope => ({
      model: on,
      models: [authors, posts, reviews, editions],
      table: (target) => `"${target.source}"`,
      escape: (name) => `"${name}"`,
    });

    it('filters on the record a key points at with EXISTS', () => {
      expect(
        whereSql(
          { author: { fullName: { contains: 'ada' } } },
          't',
          scope(posts),
        ),
      ).toEqual({
        sql: `EXISTS (SELECT 1 FROM "authors" "r0" WHERE "r0"."id" = t.authorId AND LOWER("r0"."full_name") LIKE :p0 ESCAPE '!')`,
        parameters: { p0: '%ada%' },
      });
    });

    it('filters on some, none or every related record', () => {
      const { sql } = whereSql(
        {
          posts: {
            some: { title: { eq: 'a' } },
            none: { title: { eq: 'b' } },
            every: { title: { ne: 'c' } },
          },
        },
        't',
        scope(authors),
      );
      expect(sql).toBe(
        [
          `EXISTS (SELECT 1 FROM "posts" "r0" WHERE "r0"."author_id" = t.id AND "r0"."title" = :p0)`,
          `NOT EXISTS (SELECT 1 FROM "posts" "r1" WHERE "r1"."author_id" = t.id AND "r1"."title" = :p1)`,
          `NOT EXISTS (SELECT 1 FROM "posts" "r2" WHERE "r2"."author_id" = t.id AND NOT ("r2"."title" <> :p2))`,
        ].join(' AND '),
      );
    });

    it('nests relation filters and matches composite keys column by column', () => {
      expect(
        whereSql(
          { posts: { some: { author: { fullName: { eq: 'x' } } } } },
          't',
          scope(authors),
        ).sql,
      ).toBe(
        `EXISTS (SELECT 1 FROM "posts" "r0" WHERE "r0"."author_id" = t.id AND EXISTS (SELECT 1 FROM "authors" "r1" WHERE "r1"."id" = "r0"."author_id" AND "r1"."full_name" = :p0))`,
      );
      expect(whereSql({ editions: {} }, 't', scope(reviews)).sql).toBe(
        `EXISTS (SELECT 1 FROM "editions" "r0" WHERE "r0"."book_id" = t.bookId AND "r0"."edition" = t.edition AND 1 = 1)`,
      );
    });
  });
});
