import type { TypeEqual } from 'ts-expect';
import { expectType } from 'ts-expect';
import type { PageProps, RouteConfig } from 'waku/router';
import { Link, useRouter } from 'waku/router/client';

expectType<
  TypeEqual<
    RouteConfig['paths'],
    | '/'
    | '/about'
    | `/products/${string}`
    | `/docs/${string}`
    | `/@${string}`
    | '/articles/intro'
    | '/articles/advanced'
  >
>(true);

// @ts-expect-error generated page patterns constrain page props
export type UnknownPage = PageProps<'/missing'>;

export function RawNavigationProbe({ unknown }: { unknown: string }) {
  const router = useRouter();
  void router.push('/products/42?tab=details#price');
  void router.replace('/about/#top');
  router.prefetch('/articles/intro');
  // @ts-expect-error unknown raw paths are not generated hrefs
  void router.push('/missing');
  // @ts-expect-error unknown raw paths are not generated hrefs
  void router.replace('/missing?tab=details#top');
  // @ts-expect-error unknown raw paths are not generated hrefs
  router.prefetch('/missing');
  // @ts-expect-error a widened string is not a generated href
  void router.push(unknown);

  return (
    <>
      <Link to="/about">About</Link>
      <Link to="/about/?tab=details#top">About Query</Link>
      <Link to="/products/42#price">Product</Link>
      <Link to="?tab=details">Query</Link>
      <Link to="#top">Hash</Link>
      <Link to="/articles/advanced">Article</Link>
      {/* @ts-expect-error unknown raw paths are not generated hrefs */}
      <Link to="/missing">Missing</Link>
      {/* @ts-expect-error a widened string is not a generated href */}
      <Link to={unknown}>Unknown</Link>
      {/* @ts-expect-error static enumerations reject unlisted slugs */}
      <Link to="/articles/missing">Missing Article</Link>
      {/* @ts-expect-error navigation accepts href strings, not structured targets */}
      <Link to={{ to: '/products/[id]', params: { id: '42' } }}>Object</Link>
    </>
  );
}
