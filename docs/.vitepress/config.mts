import { type DefaultTheme, defineConfig } from 'vitepress';

const repo = 'https://github.com/nest-modules/inverse-model';
const npm = 'https://www.npmjs.com/package/@nestjs-modules/inverse-model';

/** Sidebar of one language: `prefix` is '' for English and '/es' for Spanish. */
function sidebar(
  prefix: string,
  labels: {
    introduction: string;
    guide: string;
    databases: string;
    reference: string;
    pages: Record<string, string>;
  },
): DefaultTheme.Sidebar {
  const item = (path: string) => ({
    text: labels.pages[path],
    link: `${prefix}${path}`,
  });
  return [
    {
      text: labels.introduction,
      items: ['/guide/what-is-it', '/guide/getting-started'].map(item),
    },
    {
      text: labels.guide,
      items: [
        '/guide/generated-api',
        '/guide/filters',
        '/guide/pagination',
        '/guide/relations',
        '/guide/mutations',
        '/guide/naming',
        '/guide/security',
        '/guide/caching',
        '/guide/extending',
        '/guide/cli',
      ].map(item),
    },
    {
      text: labels.databases,
      items: [
        '/databases/',
        '/databases/postgres',
        '/databases/mysql',
        '/databases/sqlserver',
        '/databases/mongodb',
      ].map(item),
    },
    {
      text: labels.reference,
      items: [
        '/reference/options',
        '/reference/type-mapping',
        '/reference/contributing',
      ].map(item),
    },
  ];
}

const versionMenu = (changelog: string) => ({
  text: '0.1.0',
  items: [
    { text: changelog, link: `${repo}/blob/main/CHANGELOG.md` },
    { text: 'npm', link: npm },
  ],
});

export default defineConfig({
  title: 'Inverse Model',
  // Served from GitHub Pages at nest-modules.github.io/inverse-model/.
  base: '/inverse-model/',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: '/inverse-model/logo.svg' }]],

  locales: {
    // English is the default, at the root of the site.
    root: {
      label: 'English',
      lang: 'en-US',
      description:
        'A GraphQL API over your existing database, inside NestJS, from just its connection string.',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/getting-started' },
          { text: 'Reference', link: '/reference/options' },
          versionMenu('Changelog'),
        ],
        sidebar: sidebar('', {
          introduction: 'Introduction',
          guide: 'Guide',
          databases: 'Databases',
          reference: 'Reference',
          pages: {
            '/guide/what-is-it': 'What is Inverse Model?',
            '/guide/getting-started': 'Getting started',
            '/guide/generated-api': 'The generated API',
            '/guide/filters': 'Filters and ordering',
            '/guide/pagination': 'Pagination',
            '/guide/relations': 'Relations',
            '/guide/mutations': 'Mutations',
            '/guide/naming': 'Naming',
            '/guide/security': 'Security',
            '/guide/caching': 'Caching',
            '/guide/extending': 'Extending the API',
            '/guide/cli': 'CLI',
            '/databases/': 'Support matrix',
            '/databases/postgres': 'PostgreSQL',
            '/databases/mysql': 'MySQL and MariaDB',
            '/databases/sqlserver': 'SQL Server',
            '/databases/mongodb': 'MongoDB',
            '/reference/options': 'Options',
            '/reference/type-mapping': 'Type mapping',
            '/reference/contributing': 'Contributing',
          },
        }),
        editLink: {
          pattern: `${repo}/edit/main/docs/:path`,
          text: 'Edit this page on GitHub',
        },
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © nest-modules',
        },
      },
    },

    es: {
      label: 'Español',
      lang: 'es',
      link: '/es/',
      description:
        'Una API GraphQL sobre tu base de datos existente, dentro de NestJS, solo con su connection string.',
      themeConfig: {
        nav: [
          { text: 'Guía', link: '/es/guide/getting-started' },
          { text: 'Referencia', link: '/es/reference/options' },
          versionMenu('Cambios'),
        ],
        sidebar: sidebar('/es', {
          introduction: 'Introducción',
          guide: 'Guía',
          databases: 'Bases de datos',
          reference: 'Referencia',
          pages: {
            '/guide/what-is-it': '¿Qué es Inverse Model?',
            '/guide/getting-started': 'Primeros pasos',
            '/guide/generated-api': 'La API generada',
            '/guide/filters': 'Filtros y orden',
            '/guide/pagination': 'Paginación',
            '/guide/relations': 'Relaciones',
            '/guide/mutations': 'Mutations',
            '/guide/naming': 'Nombres',
            '/guide/security': 'Seguridad',
            '/guide/caching': 'Cache',
            '/guide/extending': 'Extender la API',
            '/guide/cli': 'CLI',
            '/databases/': 'Bases soportadas',
            '/databases/postgres': 'PostgreSQL',
            '/databases/mysql': 'MySQL y MariaDB',
            '/databases/sqlserver': 'SQL Server',
            '/databases/mongodb': 'MongoDB',
            '/reference/options': 'Opciones',
            '/reference/type-mapping': 'Mapeo de tipos',
            '/reference/contributing': 'Contribuir',
          },
        }),
        editLink: {
          pattern: `${repo}/edit/main/docs/:path`,
          text: 'Editar esta página en GitHub',
        },
        footer: {
          message: 'Publicado bajo la licencia MIT.',
          copyright: 'Copyright © nest-modules',
        },
        outline: { label: 'En esta página' },
        docFooter: { prev: 'Anterior', next: 'Siguiente' },
        lastUpdated: { text: 'Última actualización' },
        returnToTopLabel: 'Volver arriba',
        sidebarMenuLabel: 'Menú',
        darkModeSwitchLabel: 'Apariencia',
        lightModeSwitchTitle: 'Cambiar a modo claro',
        darkModeSwitchTitle: 'Cambiar a modo oscuro',
        langMenuLabel: 'Cambiar idioma',
        notFound: {
          title: 'PÁGINA NO ENCONTRADA',
          quote: 'Esta página no existe, o se movió.',
          linkText: 'Ir al inicio',
        },
      },
    },
  },

  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [{ icon: 'github', link: repo }],
    search: {
      provider: 'local',
      options: {
        locales: {
          es: {
            translations: {
              button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' },
              modal: {
                displayDetails: 'Mostrar detalles',
                resetButtonTitle: 'Borrar la búsqueda',
                backButtonTitle: 'Cerrar la búsqueda',
                noResultsText: 'Sin resultados para',
                footer: {
                  selectText: 'para elegir',
                  navigateText: 'para moverte',
                  closeText: 'para cerrar',
                },
              },
            },
          },
        },
      },
    },
  },
});
