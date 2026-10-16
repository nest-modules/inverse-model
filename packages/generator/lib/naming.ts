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

/** `blog_posts` → `blogPosts` */
export const camelCase = (name: string) => {
  const pascal = pascalCase(name);
  return pascal[0].toLowerCase() + pascal.slice(1);
};

/** `blog_posts` → `blog-posts` */
export const kebabCase = (name: string) => words(name).join('-');
