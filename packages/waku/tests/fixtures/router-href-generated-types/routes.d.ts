import type {
  GetConfigResponse,
  PathsForPages,
  SearchCodecsForPages,
} from 'waku/router';
import type { getConfig as getArticleConfig } from './pages/articles.js';
import type { getConfig as getProductConfig } from './pages/products.js';

type Page =
  | { path: '/'; render: 'static' }
  | { path: '/about'; render: 'static' }
  | ({ path: '/products/[id]' } & GetConfigResponse<typeof getProductConfig>)
  | { path: '/docs/[...parts]'; render: 'dynamic' }
  | { path: '/@[name]'; render: 'dynamic' }
  | ({ path: '/articles/[slug]' } & GetConfigResponse<typeof getArticleConfig>);

declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>;
  }
  interface CreatePagesConfig {
    pages: Page;
  }
  interface SearchCodecsConfig extends SearchCodecsForPages<Page> {}
}
