import { unstable_createRouteHref } from 'waku/router';
import { Link, useRouter } from 'waku/router/client';
import { unstable_redirect } from 'waku/router/server';

const nestedProduct = unstable_createRouteHref({
  path: '/products/foo/[slug]',
});
const href = nestedProduct({ params: { slug: 'bar' } });

export function OverlappingPatternProbe() {
  const router = useRouter();
  // @ts-expect-error a matching raw href prefix does not register this pattern
  void router.push(href);
  // @ts-expect-error a matching raw href prefix does not register this pattern
  void router.replace(href);
  // @ts-expect-error a matching raw href prefix does not register this pattern
  router.prefetch(href);
  return (
    // @ts-expect-error a matching raw href prefix does not register this pattern
    <Link to={href}>Unknown nested product</Link>
  );
}

export function OverlappingPatternRedirectProbe() {
  // @ts-expect-error a matching raw href prefix does not register this pattern
  unstable_redirect(href);
}
