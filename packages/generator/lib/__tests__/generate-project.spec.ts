import type { DatabaseSchema } from '@nestjs-modules/inverse-introspector';
import { generateProject } from '../generate-project';

const schema: DatabaseSchema = {
  dialect: 'postgres',
  name: 'blog',
  tables: [
    {
      schema: 'public',
      name: 'blog_posts',
      primaryKey: ['id'],
      foreignKeys: [],
      columns: [
        {
          name: 'id',
          dataType: 'integer',
          kind: 'int',
          nullable: false,
          hasDefault: true,
        },
        {
          name: 'title',
          dataType: 'text',
          kind: 'string',
          nullable: false,
          hasDefault: false,
        },
      ],
    },
  ],
};

describe('generateProject', () => {
  const files = generateProject(schema, {
    name: 'blog-api',
    databaseUrl: 'postgres://localhost/blog',
  });
  const content = (path: string) =>
    files.find((file) => file.path === path)?.content;

  it('exposes one create mutation per table', () => {
    expect(content('src/blog-posts/blog-posts.resolver.ts')).toContain(
      "createBlogPosts(@Args('input') input: CreateBlogPostsInput)",
    );
  });

  it('lets columns with a default be left out of the input', () => {
    const input = content('src/blog-posts/create-blog-posts.input.ts');
    expect(input).toContain('id?: number;');
    expect(input).toContain('title: string;');
  });

  it('registers every entity module in the app module', () => {
    expect(content('src/app.module.ts')).toContain('BlogPostsModule,');
  });
});
