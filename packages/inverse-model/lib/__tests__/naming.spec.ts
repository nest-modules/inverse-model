import { camelCase, pascalCase } from '../utils/naming';

describe('naming', () => {
  it('turns table names into entity names', () => {
    expect(pascalCase('blog_posts')).toBe('BlogPosts');
  });

  it('turns column names into property names', () => {
    expect(camelCase('created_at')).toBe('createdAt');
  });
});
