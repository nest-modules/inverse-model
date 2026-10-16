import { lowerFirst, pascalCase, pluralOf } from '../utils/naming';
import type { ModelDefinition } from './database-adapter.interface';

/**
 * A foreign key: `source.fields` reference `target.references`, column by
 * column. A single field holding an array references a row per element.
 */
export interface ForeignKey {
  source: ModelDefinition;
  fields: string[];
  target: ModelDefinition;
  references: string[];
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

const holdsArray = (model: ModelDefinition, fields: string[]) =>
  fields.length === 1 &&
  model.fields.some((field) => field.property === fields[0] && field.isArray);

/**
 * Adds both ends of each foreign key to its models: `blog_posts.author_id`
 * gives `BlogPost.author` and `Author.blogPosts`.
 */
export function addRelations(foreignKeys: readonly ForeignKey[]): void {
  for (const key of foreignKeys) {
    const { source, fields, target, references } = key;
    const isArray = holdsArray(source, fields);

    // author_id and authorId become author, and tag_ids tags; a composite key
    // or one without that suffix is named after the target.
    const [field] = fields;
    const stripped =
      fields.length === 1
        ? isArray
          ? field.replace(/Ids$/, 's')
          : field.replace(/Id$/, '')
        : '';
    const one =
      stripped && stripped !== field ? stripped : lowerFirst(target.name);
    source.relations.push({
      property: unique(one, takenNames(source)),
      kind: isArray ? 'many' : 'one',
      target: target.name,
      fields,
      references,
    });

    // Two keys from the same table to the same target need telling apart.
    const siblings = foreignKeys.filter(
      (other) => other.source === source && other.target === target,
    );
    const plural = lowerFirst(pluralOf(source));
    const many =
      siblings.length > 1
        ? `${plural}By${pascalCase(fields.join('_'))}`
        : plural;
    target.relations.push({
      property: unique(many, takenNames(target)),
      kind: 'many',
      target: source.name,
      fields: references,
      references: fields,
    });
  }
}
