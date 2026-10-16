import { camelCase, pascalCase } from '../utils/naming';
import type { ModelDefinition } from './database-adapter.interface';

/** A single-column foreign key: `source.field` references `target.reference`. */
export interface ForeignKey {
  source: ModelDefinition;
  field: string;
  target: ModelDefinition;
  reference: string;
}

const takenNames = (model: ModelDefinition) =>
  new Set([
    ...model.fields.map((field) => field.property),
    ...model.relations.map((relation) => relation.property),
  ]);

function unique(name: string, taken: Set<string>): string {
  let candidate = name;
  for (let n = 2; taken.has(candidate); n++) candidate = `${name}${n}`;
  return candidate;
}

/**
 * Adds both ends of each foreign key to its models: `blog_posts.author_id`
 * gives `BlogPosts.author` and `Authors.blogPosts`.
 */
export function addRelations(foreignKeys: readonly ForeignKey[]): void {
  for (const key of foreignKeys) {
    const { source, field, target, reference } = key;

    // author_id and authorId become author; a key without that suffix is named after the target.
    const stripped = field.replace(/Id$/, '');
    const one =
      stripped && stripped !== field ? stripped : camelCase(target.name);
    source.relations.push({
      property: unique(one, takenNames(source)),
      kind: 'one',
      target: target.name,
      field,
      reference,
    });

    // Two keys from the same table to the same target need telling apart.
    const siblings = foreignKeys.filter(
      (other) => other.source === source && other.target === target,
    );
    const many =
      siblings.length > 1
        ? `${camelCase(source.name)}By${pascalCase(field)}`
        : camelCase(source.name);
    target.relations.push({
      property: unique(many, takenNames(target)),
      kind: 'many',
      target: source.name,
      field: reference,
      reference: field,
    });
  }
}
