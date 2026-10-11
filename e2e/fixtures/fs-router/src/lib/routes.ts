import { unstable_createRouteHref } from 'waku/router';
import { demoSearchCodec } from './search';

export const searchRoute = unstable_createRouteHref({
  path: '/search',
  search: demoSearchCodec,
});

export const groupedSearchRoute = unstable_createRouteHref({
  path: '/(search-group)/grouped-search',
  search: demoSearchCodec,
});

export const nestedRoute = unstable_createRouteHref({ path: '/nested/[name]' });
