import { defineConfig } from 'vitepress';

const repo = 'https://github.com/nest-modules/inverse-model';

export default defineConfig({
  title: 'Inverse Model',
  description:
    'A GraphQL API over your existing database, inside NestJS, from just its connection string.',
  // Served from GitHub Pages at nest-modules.github.io/inverse-model/.
  base: '/inverse-model/',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: '/inverse-model/logo.svg' }]],

  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/options' },
      {
        text: '0.1.0',
        items: [
          { text: 'Changelog', link: `${repo}/blob/main/CHANGELOG.md` },
          {
            text: 'npm',
            link: 'https://www.npmjs.com/package/@nestjs-modules/inverse-model',
          },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Inverse Model?', link: '/guide/what-is-it' },
          { text: 'Getting started', link: '/guide/getting-started' },
        ],
      },
      {
        text: 'Guide',
        items: [
          { text: 'The generated API', link: '/guide/generated-api' },
          { text: 'Filters and ordering', link: '/guide/filters' },
          { text: 'Pagination', link: '/guide/pagination' },
          { text: 'Relations', link: '/guide/relations' },
          { text: 'Mutations', link: '/guide/mutations' },
          { text: 'Naming', link: '/guide/naming' },
          { text: 'Security', link: '/guide/security' },
          { text: 'Caching', link: '/guide/caching' },
          { text: 'Extending the API', link: '/guide/extending' },
          { text: 'CLI', link: '/guide/cli' },
        ],
      },
      {
        text: 'Databases',
        items: [
          { text: 'Support matrix', link: '/databases/' },
          { text: 'PostgreSQL', link: '/databases/postgres' },
          { text: 'MySQL and MariaDB', link: '/databases/mysql' },
          { text: 'SQL Server', link: '/databases/sqlserver' },
          { text: 'MongoDB', link: '/databases/mongodb' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Options', link: '/reference/options' },
          { text: 'Type mapping', link: '/reference/type-mapping' },
          { text: 'Contributing', link: '/reference/contributing' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: repo }],
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },
    search: { provider: 'local' },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © nest-modules',
    },
  },
});
