import type {
  DatabaseRecord,
  ModelDefinition,
  SortDirection,
  Where,
} from '../adapters/database-adapter.interface';

/** Sort of a connection: the order asked for, then the primary key so every row has its place. */
export type CursorOrder = [property: string, direction: SortDirection][];

export function cursorOrder(
  model: ModelDefinition,
  orderBy: Record<string, SortDirection | null>[] | null | undefined,
): CursorOrder {
  const order: CursorOrder = [];
  for (const entry of orderBy ?? []) {
    for (const [property, direction] of Object.entries(entry)) {
      if (direction && !order.some(([taken]) => taken === property)) {
        order.push([property, direction]);
      }
    }
  }
  for (const key of model.primaryKey) {
    if (!order.some(([taken]) => taken === key)) order.push([key, 'ASC']);
  }
  return order;
}

export const reverseOrder = (order: CursorOrder): CursorOrder =>
  order.map(([property, direction]) => [
    property,
    direction === 'ASC' ? 'DESC' : 'ASC',
  ]);

/** Opaque cursor of a record: its values of the order's properties. */
export const encodeCursor = (order: CursorOrder, record: DatabaseRecord) =>
  Buffer.from(
    JSON.stringify(order.map(([property]) => [property, record[property]])),
  ).toString('base64url');

/** Values of a cursor, in the order's properties; throws when it was made for another order. */
export function decodeCursor(
  cursor: string,
  order: CursorOrder,
  model: ModelDefinition,
): unknown[] {
  let pairs: unknown;
  try {
    pairs = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    pairs = null;
  }
  const valid =
    Array.isArray(pairs) &&
    pairs.length === order.length &&
    pairs.every((pair, i) => Array.isArray(pair) && pair[0] === order[i][0]);
  if (!valid) {
    throw new Error('Invalid cursor: it was not made by this list and order');
  }
  return (pairs as [string, unknown][]).map(([property, value]) => {
    const field = model.fields.find(
      (candidate) => candidate.property === property,
    );
    // Dates went into the cursor as ISO strings.
    return field?.type === 'DateTime' && value !== null
      ? new Date(value as string)
      : value;
  });
}

/** Records strictly past `value` in `direction`, wherever the database sorts nulls. */
function pastValue(
  property: string,
  direction: SortDirection,
  value: unknown,
  nullsFirst: boolean,
): Where | null {
  const ascending = direction === 'ASC';
  // Nulls lead when they sort low and the order rises, or high and it falls.
  const nullsLead = nullsFirst === ascending;
  if (value === null || value === undefined) {
    return nullsLead ? { [property]: { isNull: false } } : null;
  }
  const strict = { [property]: { [ascending ? 'gt' : 'lt']: value } };
  return nullsLead
    ? strict
    : { OR: [strict, { [property]: { isNull: true } }] };
}

/**
 * Records after the cursor's `values` in `order`: past it on the first
 * property, or equal on the first ones and past it on the next.
 */
export function afterCursor(
  model: ModelDefinition,
  order: CursorOrder,
  values: unknown[],
  nullsFirst: boolean,
): Where {
  const branches: Where[] = [];
  order.forEach(([property, direction], i) => {
    const past = pastValue(property, direction, values[i], nullsFirst);
    if (!past) return;
    const equal = order.slice(0, i).map(([previous], j) => ({
      [previous]:
        values[j] === null || values[j] === undefined
          ? { isNull: true }
          : { eq: values[j] },
    }));
    branches.push({ AND: [...equal, past] });
  });
  // Nothing comes after the last record; an empty `in` matches no row.
  return branches.length > 0
    ? { OR: branches }
    : { [model.primaryKey[0]]: { in: [] } };
}
