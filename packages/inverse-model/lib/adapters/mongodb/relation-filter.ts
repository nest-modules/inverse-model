import type {
  ModelDefinition,
  RelationDefinition,
  RelationFilter,
  Where,
} from '../database-adapter.interface';

/** Distinct values of `property` among the records of `model` matching `where`; array elements count one by one. */
export type DistinctValues = (
  model: ModelDefinition,
  where: Where,
  property: string,
) => Promise<unknown[]>;

/**
 * Turns relation filters into field filters, since MongoDB cannot join in a
 * query: the related records are read first, and the filter becomes an `in`
 * on the values that link to them. Every relation here has a single field.
 */
export async function resolveRelationFilters(
  where: Where | null | undefined,
  model: ModelDefinition,
  models: readonly ModelDefinition[],
  distinct: DistinctValues,
): Promise<Where | null | undefined> {
  if (!where) return where;

  /** Records whose link is among the values of related records matching `related`. */
  async function linkedTo(
    relation: RelationDefinition,
    related: Where,
  ): Promise<Where> {
    const target = models.find(
      (candidate) => candidate.name === relation.target,
    ) as ModelDefinition;
    const resolved =
      (await resolveRelationFilters(related, target, models, distinct)) ?? {};
    const values = await distinct(target, resolved, relation.references[0]);
    return { [relation.fields[0]]: { in: values } };
  }

  const resolved: Where = {};
  const conditions: Where[] = [];
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined || value === null) continue;
    const relation = model.relations.find(
      (candidate) => candidate.property === key,
    );
    if (key === 'AND' || key === 'OR') {
      resolved[key] = (await Promise.all(
        (value as Where[]).map((child) =>
          resolveRelationFilters(child, model, models, distinct),
        ),
      )) as Where[];
    } else if (key === 'NOT') {
      resolved.NOT = await resolveRelationFilters(
        value as Where,
        model,
        models,
        distinct,
      );
    } else if (!relation) {
      resolved[key] = value;
    } else {
      if (relation.kind === 'one') {
        conditions.push(await linkedTo(relation, value as Where));
      } else {
        const { some, none, every } = value as RelationFilter;
        if (some) conditions.push(await linkedTo(relation, some));
        if (none) conditions.push({ NOT: await linkedTo(relation, none) });
        // Every related record matches when none fails the filter.
        if (every) {
          conditions.push({ NOT: await linkedTo(relation, { NOT: every }) });
        }
      }
    }
  }
  if (conditions.length > 0) {
    resolved.AND = [...(resolved.AND ?? []), ...conditions];
  }
  return resolved;
}
