-- SQL Server version of schema.sql. It is idempotent: compose.yaml runs it as the
-- healthcheck, since the image has no init scripts, so the server is healthy once seeded.
IF DB_ID('inverse_blog') IS NULL CREATE DATABASE inverse_blog;
GO
USE inverse_blog;
GO
IF OBJECT_ID('dbo.authors') IS NULL
CREATE TABLE dbo.authors (
  id         int IDENTITY(1, 1) PRIMARY KEY,
  full_name  nvarchar(max) NOT NULL,
  email      nvarchar(255) NOT NULL UNIQUE,
  created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.blog_posts') IS NULL
CREATE TABLE dbo.blog_posts (
  id         bigint IDENTITY(1, 1) PRIMARY KEY,
  author_id  int NOT NULL REFERENCES dbo.authors (id),
  title      nvarchar(max) NOT NULL,
  body       nvarchar(max),
  published  bit NOT NULL DEFAULT 0,
  rating     float,
  metadata   nvarchar(max)
);
