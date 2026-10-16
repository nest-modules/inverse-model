// Exercises the generated GraphQL API of the running app end to end and fails on the first error:
// create, read by key, filter, count, follow relations both ways, filter by relation, page by
// cursor, upsert, write in batches, update and delete.
//   node scripts/smoke-test.mjs [http://localhost:3000/graphql]
const url = process.argv[2] ?? 'http://localhost:3000/graphql';

// The container can report healthy a moment before its port is reachable from the host.
async function send(body, attempts = 10) {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  } catch (error) {
    if (attempts <= 1) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return send(body, attempts - 1);
  }
}

async function call(query, variables) {
  const response = await send(JSON.stringify({ query, variables }));
  const { data, errors } = await response.json();
  if (errors) throw new Error(`${query}\n${JSON.stringify(errors, null, 2)}`);
  return data;
}

function check(condition, message, actual) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(actual)}`);
  console.log(`ok - ${message}`);
}

// Keys are Int or String (bigint) on SQL databases and ID on MongoDB. The app may run with
// introspection off, so they go inline: a number stays a number, anything else is quoted.
const literal = (value) =>
  typeof value === 'number' ? String(value) : JSON.stringify(value);

const email = `smoke-${Date.now()}@example.com`;
const { createAuthor: author } = await call(
  'mutation ($email: String!) { createAuthor(input: { fullName: "Smoke", email: $email }) { id fullName } }',
  { email },
);
check(
  author.id != null && author.fullName === 'Smoke',
  'creates an author',
  author,
);

const { createBlogPost: post } = await call(
  `mutation { createBlogPost(input: { authorId: ${literal(author.id)}, title: "Smoke post", published: true }) { id title published } }`,
);
check(post.published === true, 'creates a post for it', post);

const read = await call(
  `query ($email: String!) {
    author(id: ${literal(author.id)}) { email blogPosts { title author { fullName } } }
    authors(where: { email: { eq: $email } }) { id }
    authorsCount(where: { email: { eq: $email } })
    blogPosts(where: { title: { contains: "SMOKE" } }, orderBy: [{ id: DESC }], limit: 5) { title author { email } }
  }`,
  { email },
);
check(
  read.author.email === email,
  'reads the author by key',
  read.author,
);
check(
  read.author.blogPosts[0]?.author.fullName === 'Smoke',
  'follows author → posts → author',
  read.author.blogPosts,
);
check(
  read.authorsCount === 1 && read.authors.length === 1,
  'filters and counts',
  read,
);
check(
  read.blogPosts.some((found) => found.author.email === email),
  'filters posts case-insensitively, with their author',
  read.blogPosts,
);

const related = await call(
  `query ($email: String!) {
    blogPosts(where: { author: { email: { eq: $email } } }) { title }
    authors(where: { email: { eq: $email }, blogPosts: { some: { published: { eq: true } } } }) { email }
    blogPostsConnection(where: { authorId: { eq: ${literal(author.id)} } }, first: 1) {
      edges { cursor node { title } } pageInfo { hasNextPage endCursor } totalCount
    }
  }`,
  { email },
);
check(
  related.blogPosts.length === 1 && related.authors.length === 1,
  'filters by relation both ways',
  related,
);
check(
  related.blogPostsConnection.totalCount === 1 &&
    related.blogPostsConnection.edges[0].node.title === 'Smoke post' &&
    related.blogPostsConnection.pageInfo.hasNextPage === false,
  'pages by cursor',
  related.blogPostsConnection,
);

const batch = await call(
  `mutation {
    upsertAuthor(input: { id: ${literal(author.id)}, fullName: "Smoke", email: "${email}" }) { fullName }
    createManyBlogPosts(inputs: [
      { authorId: ${literal(author.id)}, title: "Smoke batch 1" },
      { authorId: ${literal(author.id)}, title: "Smoke batch 2" }
    ])
  }`,
);
const { deleteManyBlogPosts } = await call(
  `mutation { deleteManyBlogPosts(where: { authorId: { eq: ${literal(author.id)} }, title: { contains: "batch" } }) }`,
);
check(
  batch.upsertAuthor.fullName === 'Smoke' &&
    batch.createManyBlogPosts === 2 &&
    deleteManyBlogPosts === 2,
  'upserts and writes in batches',
  { ...batch, deleteManyBlogPosts },
);

const { updateAuthor } = await call(
  `mutation { updateAuthor(id: ${literal(author.id)}, input: { fullName: "Smoke 2" }) { fullName } }`,
);
check(updateAuthor.fullName === 'Smoke 2', 'updates the author', updateAuthor);

await call(`mutation { deleteBlogPost(id: ${literal(post.id)}) { id } }`);
const { deleteAuthor } = await call(
  `mutation { deleteAuthor(id: ${literal(author.id)}) { email } }`,
);
const { author: gone } = await call(
  `{ author(id: ${literal(author.id)}) { id } }`,
);
check(
  deleteAuthor.email === email && gone === null,
  'deletes them',
  { deleteAuthor, gone },
);
