import type {
  FieldFilter,
  ModelDefinition,
  RelationDefinition,
  RelationFilter,
  Where,
} from '../database-adapter.interface';

export interface SqlCondition {
  sql: string;
  parameters: Record<string, unknown>;
}

/** What relation filters need: the models, and how to write their tables in SQL. */
export interface RelationScope {
  /** The model the filter is on. */
  model: ModelDefinition;
  models: readonly ModelDefinition[];
  /** Escaped, schema-qualified table of a model. */
  table(model: ModelDefinition): string;
  /** Escapes an alias or column name. */
  escape(name: string): string;
}

/** Writes the column of a property of the model being filtered. */
interface Scope {
  model?: ModelDefinition;
  column(property: string): string;
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
 * them for the column names) and values as named parameters. Given the
 * `relations` scope, a relation property filters through an EXISTS subquery
 * whose columns are written out, since TypeORM only knows the main alias.
 */
export function whereSql(
  where: Where | null | undefined,
  alias: string,
  relations?: RelationScope,
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

  let subqueries = 0;

  /** EXISTS over the records related to the current one that match `where`, or fail it. */
  function exists(
    scope: Scope,
    relation: RelationDefinition,
    where: Where | null | undefined,
    failing = false,
  ): string {
    const { models, table, escape: quote } = relations as RelationScope;
    const target = models.find(
      (model) => model.name === relation.target,
    ) as ModelDefinition;
    const sub = quote(`r${subqueries++}`);
    const inner: Scope = {
      model: target,
      column: (property) =>
        `${sub}.${quote(target.fields.find((field) => field.property === property)?.name ?? property)}`,
    };
    const conditions = relation.fields.map(
      (field, i) =>
        `${inner.column(relation.references[i])} = ${scope.column(field)}`,
    );
    if (where) {
      const sql = build(where, inner);
      conditions.push(failing ? `NOT (${sql})` : sql);
    }
    return `EXISTS (SELECT 1 FROM ${table(target)} ${sub} WHERE ${conditions.join(' AND ')})`;
  }

  function relationSql(
    scope: Scope,
    relation: RelationDefinition,
    value: Where | RelationFilter,
  ): string[] {
    if (relation.kind === 'one')
      return [exists(scope, relation, value as Where)];
    const { some, none, every } = value as RelationFilter;
    const parts: string[] = [];
    if (some) parts.push(exists(scope, relation, some));
    if (none) parts.push(`NOT ${exists(scope, relation, none)}`);
    if (every) parts.push(`NOT ${exists(scope, relation, every, true)}`);
    return parts;
  }

  function build(node: Where, scope: Scope): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(node)) {
      if (value === undefined || value === null) continue;
      if (key === 'AND' || key === 'OR') {
        const children = (value as Where[]).map((child) => build(child, scope));
        if (children.length > 0) {
          parts.push(`(${children.join(` ${key} `)})`);
        }
      } else if (key === 'NOT') {
        parts.push(`NOT (${build(value as Where, scope)})`);
      } else {
        const relation = relations
          ? scope.model?.relations.find((r) => r.property === key)
          : undefined;
        parts.push(
          ...(relation
            ? relationSql(scope, relation, value as Where | RelationFilter)
            : fieldSql(scope.column(key), value as FieldFilter)),
        );
      }
    }
    return parts.length > 0 ? parts.join(' AND ') : '1 = 1';
  }

  const root: Scope = {
    model: relations?.model,
    column: (property) => `${alias}.${property}`,
  };
  return { sql: where ? build(where, root) : '1 = 1', parameters };
}
