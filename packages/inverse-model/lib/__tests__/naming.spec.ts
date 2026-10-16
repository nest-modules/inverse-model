import {
  camelCase,
  defaultNaming,
  lowerFirst,
  pascalCase,
  pluralOf,
  resolveNaming,
} from '../utils/naming';

describe('naming', () => {
  it('turns table names into entity names', () => {
    expect(pascalCase('blog_posts')).toBe('BlogPosts');
  });

  it('turns column names into property names', () => {
    expect(camelCase('created_at')).toBe('createdAt');
  });

  it('lowers only the first letter', () => {
    expect(lowerFirst('BlogPost')).toBe('blogPost');
    expect(lowerFirst('HTTPLog')).toBe('hTTPLog');
    expect(lowerFirst('')).toBe('');
  });
});

describe('defaultNaming', () => {
  it.each([
    ['blog_posts', 'BlogPost'],
    ['authors', 'Author'],
    ['public.blog_posts', 'BlogPost'],
    ['audit.users', 'User'],
    ['people', 'Person'],
    ['categories', 'Category'],
    ['news', 'News'],
    ['user', 'User'],
    ['ORDER_ITEMS', 'OrderItem'],
  ])('names the table %s as the type %s', (table, type) => {
    expect(defaultNaming.type(table)).toBe(type);
  });

  it('names columns in camelCase', () => {
    expect(defaultNaming.field('created_at', 'posts')).toBe('createdAt');
  });

  it('names lists in the plural', () => {
    expect(defaultNaming.plural('BlogPost')).toBe('BlogPosts');
    expect(defaultNaming.plural('Person')).toBe('People');
  });

  it('gives the plural a model carries, or the English one', () => {
    expect(pluralOf({ name: 'Person' })).toBe('People');
    expect(pluralOf({ name: 'Person', plural: 'Persons' })).toBe('Persons');
  });
});

describe('resolveNaming', () => {
  it('fills in what the option leaves out', () => {
    const type = (table: string) => `T${table}`;
    const naming = resolveNaming({ type });
    expect(naming.type).toBe(type);
    expect(naming.field).toBe(defaultNaming.field);
    expect(naming.plural).toBe(defaultNaming.plural);
  });

  it('is the default without an option', () => {
    expect(resolveNaming()).toEqual(defaultNaming);
  });
});
