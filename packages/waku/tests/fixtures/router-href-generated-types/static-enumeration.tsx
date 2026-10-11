import { unstable_createRouteHref } from 'waku/router';
import { Link, useRouter } from 'waku/router/client';
import { unstable_redirect } from 'waku/router/server';
import type { RouteHref } from '../../../src/router/isomorphic-utils/build-route-href.js';

const article = unstable_createRouteHref({ path: '/articles/[slug]' });
const intro = unstable_createRouteHref({ path: '/articles/intro' });
const groupedArticle = unstable_createRouteHref({
  path: '/(content)/(public)//articles/[slug]/',
});
const groupedHome = unstable_createRouteHref({ path: '/(content)' });
const unknown = unstable_createRouteHref({ path: '/(content)/unknown/[slug]' });

export function StaticEnumerationProbe() {
  const router = useRouter();
  const href = article({ params: { slug: 'intro' }, hash: 'details' });
  const unlisted = article({ params: { slug: 'not-built' } });
  void router.push(href);
  void router.replace(unlisted);
  router.prefetch(href);
  void router.push(groupedArticle({ params: { slug: 'intro' } }));
  void router.replace(groupedArticle({ params: { slug: 'not-built' } }));
  router.prefetch(groupedHome());
  // @ts-expect-error route groups do not make unknown patterns valid
  void router.push(unknown({ params: { slug: 'intro' } }));
  // @ts-expect-error construction proves a pattern, not finite URL membership
  const raw: RouteHref = unlisted;
  void raw;
  return (
    <>
      <Link to={href}>Intro</Link>
      <Link to={unlisted}>Known Pattern</Link>
      <Link to={groupedArticle({ params: { slug: 'intro' } })}>Grouped</Link>
      <Link to={groupedHome()}>Grouped Home</Link>
      {/* @ts-expect-error factories name registered patterns, not concrete build URLs */}
      <Link to={intro()}>Concrete Factory</Link>
      {/* @ts-expect-error unlisted raw hrefs remain rejected */}
      <Link to="/articles/not-built">Unknown Raw Href</Link>
    </>
  );
}

export function RedirectProbe() {
  unstable_redirect(article({ params: { slug: 'advanced' } }));
}
