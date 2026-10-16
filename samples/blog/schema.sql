-- Small database to try the library against; compose.yaml loads it on first start, or:
--   createdb inverse_blog && psql inverse_blog -f samples/blog/schema.sql
--   cp samples/blog/.env.example samples/blog/.env && pnpm --filter blog-sample start
CREATE TABLE authors (
  id         serial PRIMARY KEY,
  full_name  text NOT NULL,
  email      varchar(255) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blog_posts (
  id           bigserial PRIMARY KEY,
  author_id    integer NOT NULL REFERENCES authors (id),
  title        text NOT NULL,
  body         text,
  published    boolean NOT NULL DEFAULT false,
  rating       double precision,
  metadata     jsonb
);

-- Read-only in the API: listed, counted and filtered, never written.
CREATE VIEW published_posts AS
SELECT p.id, p.author_id, p.title, a.full_name AS author_name
FROM blog_posts p
JOIN authors a ON a.id = p.author_id
WHERE p.published;
