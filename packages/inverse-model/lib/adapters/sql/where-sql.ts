import type { FieldFilter, Where } from '../database-adapter.interface';

export interface SqlCondition {
  sql: string;
  parameters: Record<string, unknown>;
}

// `!` escapes LIKE wildcards on every database; a backslash would need doubling on MySQL.
const escapeLike = (value: string) => value.replace(/[!%_[]/g, '!$&');

const COMPARISONS = {
  eq: '=',
  ne: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
} as const;

/**
 * SQL for a filter, with columns written as `alias.property` (TypeORM swaps
 * them for the column names) and values as named parameters.
 */
export function whereSql(
  where: Where | null | undefined,
  alias: string,
): SqlCondition {
  const parameters: Record<string, unknown> = {};
  const parameter = (value: unknown) => {
    const name = `p${Object.keys(parameters).length}`;
    parameters[name] = value;
    return name;
  };

  function fieldSql(column: string, filter: FieldFilter): string[] {
    const parts: string[] = [];
    for (const [operator, sign] of Object.entries(COMPARISONS)) {
      const value = filter[operator as keyof typeof COMPARISONS];
      if (value !== undefined && value !== null) {
        parts.push(`${column} ${sign} :${parameter(value)}`);
      }
    }
    if (filter.in) {
      parts.push(
        filter.in.length > 0
          ? `${column} IN (:...${parameter(filter.in)})`
          : '1 = 0',
      );
    }
    if (filter.contains !== undefined && filter.contains !== null) {
      const pattern = `%${escapeLike(filter.contains.toLowerCase())}%`;
      parts.push(`LOWER(${column}) LIKE :${parameter(pattern)} ESCAPE '!'`);
    }
    if (filter.isNull !== undefined && filter.isNull !== null) {
      parts.push(`${column} IS ${filter.isNull ? '' : 'NOT '}NULL`);
    }
    return parts;
  }

  function build(node: Where): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(node)) {
      if (value === undefined || value === null) continue;
      if (key === 'AND' || key === 'OR') {
        const children = (value as Where[]).map(build);
        if (children.length > 0) {
          parts.push(`(${children.join(` ${key} `)})`);
        }
      } else if (key === 'NOT') {
        parts.push(`NOT (${build(value as Where)})`);
      } else {
        parts.push(...fieldSql(`${alias}.${key}`, value as FieldFilter));
      }
    }
    return parts.length > 0 ? parts.join(' AND ') : '1 = 1';
  }

  return { sql: where ? build(where) : '1 = 1', parameters };
}
