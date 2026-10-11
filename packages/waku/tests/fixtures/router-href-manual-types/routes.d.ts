import 'waku/router';

declare module 'waku/router' {
  interface RouteConfig {
    paths:
      | '/'
      | '/about'
      | `/products/${string}`
      | `/docs/${string}`
      | '/articles/intro'
      | '/articles/advanced';
  }
}
