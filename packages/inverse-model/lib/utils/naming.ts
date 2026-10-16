import { pluralize, singularize } from './inflection';

function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

const capitalize = (word: string) => word[0].toUpperCase() + word.slice(1);

/** `blog_posts` → `BlogPosts` */
export const pascalCase = (name: string) =>
  words(name).map(capitalize).join('');

/** `BlogPost` → `blogPost`; the rest of the name keeps its case. */
export const lowerFirst = (name: string) =>
  name && name[0].toLowerCase() + name.slice(1);

/** `blog_posts` → `blogPosts` */
export const camelCase = (name: string) => {
  const pascal = pascalCase(name);
  return pascal && pascal[0].toLowerCase() + pascal.slice(1);
};

/** How the names of the database become names of the GraphQL API. */
export interface Naming {
  /** Type name of a table or collection, given its name as listed (schema-qualified where the database has schemas). */
  type: (table: string) => string;
  /** API property of a column or document field. */
  field: (column: string, table: string) => string;
  /** Plural of a type name, for list queries and to-many relations. */
  plural: (type: string) => string;
}

/** `public.blog_posts` → `BlogPost`; the schema is left out. */
export const defaultTypeName = (table: string) =>
  singularize(pascalCase(table.split('.').pop() ?? table));

/** The conventions of the API: singular PascalCase types, camelCase properties, English plurals. */
export const defaultNaming: Naming = {
  type: defaultTypeName,
  field: (column) => camelCase(column),
  plural: pluralize,
};

/** Plural of a model's type name: `BlogPost` → `BlogPosts`. */
export const pluralOf = (model: { name: string; plural?: string }) =>
  model.plural ?? pluralize(model.name);

/** The naming asked for, with the defaults filling in what it leaves out. */
export const resolveNaming = (naming: Partial<Naming> = {}): Naming => ({
  ...defaultNaming,
  ...naming,
});
