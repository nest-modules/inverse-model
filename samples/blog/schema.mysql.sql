-- MySQL and MariaDB version of schema.sql; compose.yaml loads it on first start.
CREATE TABLE authors (
  id         int AUTO_INCREMENT PRIMARY KEY,
  full_name  text NOT NULL,
  email      varchar(255) NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE blog_posts (
  id         bigint AUTO_INCREMENT PRIMARY KEY,
  author_id  int NOT NULL,
  title      text NOT NULL,
  body       text,
  published  boolean NOT NULL DEFAULT false,
  rating     double,
  metadata   json,
  FOREIGN KEY (author_id) REFERENCES authors (id)
);

-- Read-only in the API: listed, counted and filtered, never written.
CREATE VIEW published_posts AS
SELECT p.id, p.author_id, p.title, a.full_name AS author_name
FROM blog_posts p
JOIN authors a ON a.id = p.author_id
WHERE p.published = true;
