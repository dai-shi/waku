import { useRouter } from 'waku';
import { unstable_createRouteHref } from 'waku/router';
import { groupedSearchRoute, nestedRoute } from './lib/routes';

type Router = ReturnType<typeof useRouter>;

export function assertRouterTargetTyping(router: Router, computed: string) {
  void router.prefetch('/bar');
  void router.push('/bar');
  void router.replace('/bar');
  void router.prefetch(nestedRoute({ params: { name: 'x' } }));
  void router.push(nestedRoute({ params: { name: 'x' } }));
  void router.replace(nestedRoute({ params: { name: 'x' } }));
  void router.push(groupedSearchRoute({ search: { q: 'grouped', page: 2 } }));

  const article = unstable_createRouteHref({
    path: '/page-with-segment/(article)/[slug]',
  });
  void router.push(article({ params: { slug: 'introducing-waku' } }));
  void router.push(article({ params: { slug: 'not-built' } }));
  // @ts-expect-error raw hrefs must belong to the generated static paths
  void router.push('/page-with-segment/not-built');

  const unknownRoute = unstable_createRouteHref({
    path: '/(search-group)/missing-route',
  });
  // @ts-expect-error the grouped pattern is not a generated route
  void router.push(unknownRoute());

  // @ts-expect-error a computed string is not a known route href
  void router.prefetch(computed);
  // @ts-expect-error a computed string is not a known route href
  void router.push(computed);
  // @ts-expect-error a computed string is not a known route href
  void router.replace(computed);

  void router.prefetch(computed as Parameters<Router['prefetch']>[0]);
  void router.push(computed as Parameters<Router['push']>[0]);
  void router.replace(computed as Parameters<Router['replace']>[0]);
}
