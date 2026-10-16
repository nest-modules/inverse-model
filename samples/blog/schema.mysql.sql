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
