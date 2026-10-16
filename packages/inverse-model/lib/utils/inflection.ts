// Singular → plural for words that follow no rule.
const IRREGULAR: Record<string, string> = {
  person: 'people',
  man: 'men',
  woman: 'women',
  child: 'children',
  tooth: 'teeth',
  foot: 'feet',
  mouse: 'mice',
  goose: 'geese',
  ox: 'oxen',
  datum: 'data',
  medium: 'media',
  criterion: 'criteria',
  analysis: 'analyses',
  index: 'indices',
  matrix: 'matrices',
  vertex: 'vertices',
  status: 'statuses',
  quiz: 'quizzes',
  alias: 'aliases',
  bus: 'buses',
  // Regular plurals the suffix rules below would get wrong on the way back.
  cache: 'caches',
  cookie: 'cookies',
  movie: 'movies',
  niche: 'niches',
  pie: 'pies',
  tie: 'ties',
  menu: 'menus',
};

const PLURAL_OF = new Map(Object.entries(IRREGULAR));
const SINGULAR_OF = new Map(
  Object.entries(IRREGULAR).map(([singular, plural]) => [plural, singular]),
);
// `indexes` is as common as `indices`.
SINGULAR_OF.set('indexes', 'index');

// Words whose singular and plural are the same.
const UNCOUNTABLE = new Set([
  'data',
  'equipment',
  'feedback',
  'fish',
  'information',
  'metadata',
  'money',
  'news',
  'series',
  'sheep',
  'species',
  'software',
]);

// Plurals ending in -ves whose singular ends in -f or -fe.
const VES_SINGULAR: Record<string, string> = {
  knives: 'knife',
  lives: 'life',
  wives: 'wife',
  wolves: 'wolf',
  halves: 'half',
  leaves: 'leaf',
  shelves: 'shelf',
  thieves: 'thief',
  loaves: 'loaf',
  calves: 'calf',
};
const VES_PLURAL = new Map(
  Object.entries(VES_SINGULAR).map(([plural, singular]) => [singular, plural]),
);

/** The case of `like` applied to `word`: `People` + `person` → `Person`. */
const withCaseOf = (like: string, word: string) =>
  like[0] === like[0].toUpperCase()
    ? word[0].toUpperCase() + word.slice(1)
    : word;

/** Splits off the last word of a camelCase or PascalCase name. */
function lastWord(name: string): [string, string] {
  const match = name.match(/^(.*?)([A-Z]?[a-z0-9]*)$/) as RegExpMatchArray;
  return match[2] ? [match[1], match[2]] : ['', name];
}

function inflect(
  name: string,
  convert: (word: string) => string | undefined,
): string {
  const [head, word] = lastWord(name);
  const lower = word.toLowerCase();
  if (!lower || UNCOUNTABLE.has(lower)) return name;
  const converted = convert(lower);
  return converted === undefined ? name : head + withCaseOf(word, converted);
}

function singularOf(word: string): string | undefined {
  const irregular = SINGULAR_OF.get(word) ?? VES_SINGULAR[word];
  if (irregular) return irregular;
  if (PLURAL_OF.has(word)) return word;
  if (/[^aeiou]ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ss|x|zz|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (/(ss|us|is)$/.test(word)) return undefined;
  if (word.endsWith('s') && word.length > 1) return word.slice(0, -1);
  return undefined;
}

function regularPluralOf(word: string): string {
  const irregular = PLURAL_OF.get(word) ?? VES_PLURAL.get(word);
  if (irregular) return irregular;
  if (SINGULAR_OF.has(word)) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

// A word that is already plural stays as it is.
function pluralOf(word: string): string {
  const singular = singularOf(word);
  return singular !== undefined &&
    singular !== word &&
    regularPluralOf(singular) === word
    ? word
    : regularPluralOf(word);
}

/** Singular of the last word of a name: `blogPosts` → `blogPost`, `People` → `Person`. */
export const singularize = (name: string) => inflect(name, singularOf);

/** Plural of the last word of a name: `blogPost` → `blogPosts`, `Category` → `Categories`. */
export const pluralize = (name: string) => inflect(name, pluralOf);
