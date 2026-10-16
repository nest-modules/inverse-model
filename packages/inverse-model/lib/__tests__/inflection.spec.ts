import { pluralize, singularize } from '../utils/inflection';

describe('singularize and pluralize', () => {
  it.each([
    ['post', 'posts'],
    ['BlogPost', 'BlogPosts'],
    ['category', 'categories'],
    ['day', 'days'],
    ['address', 'addresses'],
    ['box', 'boxes'],
    ['match', 'matches'],
    ['wish', 'wishes'],
    ['database', 'databases'],
    ['case', 'cases'],
    ['movie', 'movies'],
    ['cache', 'caches'],
    ['status', 'statuses'],
    ['bus', 'buses'],
    ['knife', 'knives'],
    ['shelf', 'shelves'],
    ['person', 'people'],
    ['Person', 'People'],
    ['child', 'children'],
    ['OrderItem', 'OrderItems'],
    ['UserPerson', 'UserPeople'],
    ['index', 'indices'],
  ])('%s ↔ %s', (singular, plural) => {
    expect(pluralize(singular)).toBe(plural);
    expect(singularize(plural)).toBe(singular);
  });

  it.each(['news', 'News', 'series', 'species', 'metadata', 'equipment'])(
    'leaves the uncountable %s as it is',
    (word) => {
      expect(singularize(word)).toBe(word);
      expect(pluralize(word)).toBe(word);
    },
  );

  it.each(['post', 'address', 'class', 'campus', 'analysis', 'Post2'])(
    'keeps the singular %s singular',
    (word) => {
      expect(singularize(word)).toBe(word);
    },
  );

  it.each(['posts', 'people', 'categories', 'BlogPosts'])(
    'keeps the plural %s plural',
    (word) => {
      expect(pluralize(word)).toBe(word);
    },
  );

  it('reads indexes as the plural of index', () => {
    expect(singularize('indexes')).toBe('index');
  });

  it('only changes the last word of a name', () => {
    expect(singularize('NewsPosts')).toBe('NewsPost');
    expect(pluralize('PeopleGroup')).toBe('PeopleGroups');
  });

  it('leaves an empty name empty', () => {
    expect(singularize('')).toBe('');
    expect(pluralize('')).toBe('');
  });
});
