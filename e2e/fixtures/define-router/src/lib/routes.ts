import { unstable_createRouteHref } from 'waku/router';
import { searchCodec } from './search.js';

export const fooRoute = unstable_createRouteHref({
  path: '/foo',
  search: searchCodec,
});
