import type {
  FieldDefinition,
  FieldFilter,
  ModelDefinition,
  Where,
} from '../database-adapter.interface';

const OPERATORS = {
  eq: '$eq',
  ne: '$ne',
  gt: '$gt',
  gte: '$gte',
  lt: '$lt',
  lte: '$lte',
} as const;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * MongoDB query for a filter. Properties become field paths (`pathOf`, the
 * field name unless given), and values of ID fields go through `toId` so hex
 * strings match ObjectIds. Relation filters must be resolved beforehand.
 */
export function mongoFilter(
  where: Where | null | undefined,
  model: ModelDefinition,
  toId: (value: unknown) => unknown,
  pathOf: (field: FieldDefinition) => string = (field) => field.name,
): Record<string, unknown> {
  const fieldOf = (property: string) =>
    model.fields.find((field) => field.property === property);

  function conditions(filter: FieldFilter, isId: boolean) {
    const value = (raw: unknown) => (isId ? toId(raw) : raw);
    const condition: Record<string, unknown> = {};
    for (const [operator, mongo] of Object.entries(OPERATORS)) {
      const raw = filter[operator as keyof typeof OPERATORS];
      if (raw !== undefined && raw !== null) condition[mongo] = value(raw);
    }
    if (filter.in) condition.$in = filter.in.map(value);
    if (filter.contains !== undefined && filter.contains !== null) {
      condition.$regex = escapeRegex(filter.contains);
      condition.$options = 'i';
    }
    // $eq null also matches documents without the field.
    if (filter.isNull === true) condition.$eq = null;
    if (filter.isNull === false) condition.$ne = null;
    return condition;
  }

  function build(node: Where): Record<string, unknown> {
    const clauses: Record<string, unknown>[] = [];
    for (const [key, value] of Object.entries(node)) {
      if (value === undefined || value === null) continue;
      if (key === 'AND' || key === 'OR') {
        const children = (value as Where[]).map(build);
        if (children.length > 0)
          clauses.push({ [`$${key.toLowerCase()}`]: children });
      } else if (key === 'NOT') {
        clauses.push({ $nor: [build(value as Where)] });
      } else {
        const field = fieldOf(key);
        if (!field) continue;
        const condition = conditions(value as FieldFilter, field.type === 'ID');
        if (Object.keys(condition).length > 0) {
          clauses.push({ [pathOf(field)]: condition });
        }
      }
    }
    if (clauses.length === 0) return {};
    return clauses.length === 1 ? clauses[0] : { $and: clauses };
  }

  return where ? build(where) : {};
}
