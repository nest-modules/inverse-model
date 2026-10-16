import { camelCase, pascalCase } from '../utils/naming';

describe('naming edge cases', () => {
  it.each([
    ['post', 'Post', 'post'],
    ['Post', 'Post', 'post'],
    ['POSTS', 'Posts', 'posts'],
  ])('handles the single word %s', (name, pascal, camel) => {
    expect(pascalCase(name)).toBe(pascal);
    expect(camelCase(name)).toBe(camel);
  });

  it.each([
    ['blogPosts', 'BlogPosts', 'blogPosts'],
    ['BlogPosts', 'BlogPosts', 'blogPosts'],
    ['userID', 'UserId', 'userId'],
  ])('keeps the words of the cased name %s', (name, pascal, camel) => {
    expect(pascalCase(name)).toBe(pascal);
    expect(camelCase(name)).toBe(camel);
  });

  it.each([
    ['address_line_1', 'AddressLine1', 'addressLine1'],
    ['post2tags', 'Post2tags', 'post2tags'],
    ['v2Api', 'V2Api', 'v2Api'],
  ])('keeps the digits of %s', (name, pascal, camel) => {
    expect(pascalCase(name)).toBe(pascal);
    expect(camelCase(name)).toBe(camel);
  });

  it.each([
    ['_id', 'Id', 'id'],
    ['__v', 'V', 'v'],
    ['__private__name', 'PrivateName', 'privateName'],
    ['created_at_', 'CreatedAt', 'createdAt'],
  ])('drops the surrounding underscores of %s', (name, pascal, camel) => {
    expect(pascalCase(name)).toBe(pascal);
    expect(camelCase(name)).toBe(camel);
  });

  it.each([
    ['blog-posts', 'BlogPosts', 'blogPosts'],
    ['blog posts', 'BlogPosts', 'blogPosts'],
    ['POST_TAGS', 'PostTags', 'postTags'],
  ])('splits %s on any separator', (name, pascal, camel) => {
    expect(pascalCase(name)).toBe(pascal);
    expect(camelCase(name)).toBe(camel);
  });
});
