// MongoDB version of schema.sql; compose.yaml runs it with mongosh on first start.
// Collections have no schema, so the adapter infers their fields from these documents.
const blog = db.getSiblingDB('inverse_blog');

const { insertedId: authorId } = blog.authors.insertOne({
  full_name: 'Seed Author',
  email: 'seed@example.com',
  created_at: new Date(),
});

blog.blog_posts.insertOne({
  author_id: authorId,
  title: 'Hello',
  body: 'First post',
  published: false,
  rating: 4.5,
  metadata: { tags: ['intro'] },
});
