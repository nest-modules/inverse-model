-- Small database to try the library against:
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
