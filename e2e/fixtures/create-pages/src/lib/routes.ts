import { unstable_createRouteHref } from 'waku/router';
import { demoSearchCodec } from './search.js';

export const searchRoute = unstable_createRouteHref({
  path: '/search',
  search: demoSearchCodec,
});

export const itemRoute = unstable_createRouteHref({
  path: '/items/[id]',
  search: demoSearchCodec,
});
