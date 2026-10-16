import type {
  ModelDefinition,
  RelationDefinition,
  RelationFilter,
  Where,
} from './database-adapter.interface';

const relationOf = (model: ModelDefinition, key: string) =>
  model.relations.find((relation) => relation.property === key);

const targetOf = (
  relation: RelationDefinition,
  models: readonly ModelDefinition[],
) => models.find((model) => model.name === relation.target);

/** Models a filter reads besides its own: the targets of its relation filters, nested ones too. */
export function modelsReadBy(
  model: ModelDefinition,
  where: Where | null | undefined,
  models: readonly ModelDefinition[],
  found = new Set<ModelDefinition>(),
): Set<ModelDefinition> {
  for (const [key, value] of Object.entries(where ?? {})) {
    if (value === null || value === undefined) continue;
    if (key === 'AND' || key === 'OR') {
      for (const child of value as Where[]) {
        modelsReadBy(model, child, models, found);
      }
    } else if (key === 'NOT') {
      modelsReadBy(model, value as Where, models, found);
    } else {
      const relation = relationOf(model, key);
      const target = relation && targetOf(relation, models);
      if (!relation || !target) continue;
      found.add(target);
      const nested =
        relation.kind === 'one'
          ? [value as Where]
          : Object.values(value as Record<string, Where | null>);
      for (const child of nested) modelsReadBy(target, child, models, found);
    }
  }
  return found;
}

/** Which nested filter of a relation filter: a `one` relation's, or `some`, `none` or `every`. */
export type RelationPart = 'one' | keyof RelationFilter;

export interface WhereMapping {
  /** Key of a field filter in the copy; the same by default. */
  field?(model: ModelDefinition, property: string): string;
  /** Key of a relation filter in the copy; the same by default. */
  relation?(model: ModelDefinition, relation: RelationDefinition): string;
  /** Changes the nested filter of a relation, already mapped, e.g. to narrow it. */
  nested?(
    target: ModelDefinition,
    where: Where,
    part: RelationPart,
  ): Where | Promise<Where>;
}

/** A copy of `where` with its keys and the nested filters of its relation filters mapped. */
export async function mapWhere(
  where: Where | null | undefined,
  model: ModelDefinition,
  models: readonly ModelDefinition[],
  mapping: WhereMapping,
): Promise<Where | null | undefined> {
  if (!where) return where;
  const mapped: Where = {};
  for (const [key, value] of Object.entries(where)) {
    if (value === null || value === undefined) {
      mapped[key] = value;
    } else if (key === 'AND' || key === 'OR') {
      mapped[key] = (await Promise.all(
        (value as Where[]).map((child) =>
          mapWhere(child, model, models, mapping),
        ),
      )) as Where[];
    } else if (key === 'NOT') {
      mapped.NOT = await mapWhere(value as Where, model, models, mapping);
    } else {
      const relation = relationOf(model, key);
      const target = relation && targetOf(relation, models);
      if (!relation || !target) {
        mapped[mapping.field?.(model, key) ?? key] = value;
        continue;
      }
      const nested = async (child: Where, part: RelationPart) => {
        const inner = (await mapWhere(child, target, models, mapping)) ?? {};
        return mapping.nested ? mapping.nested(target, inner, part) : inner;
      };
      const name = mapping.relation?.(model, relation) ?? key;
      if (relation.kind === 'one') {
        mapped[name] = await nested(value as Where, 'one');
      } else {
        const filter: RelationFilter = {};
        for (const part of ['some', 'none', 'every'] as const) {
          const child = (value as RelationFilter)[part];
          if (child) filter[part] = await nested(child, part);
        }
        mapped[name] = filter;
      }
    }
  }
  return mapped;
}
