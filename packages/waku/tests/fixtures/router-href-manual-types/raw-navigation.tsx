import type { TypeEqual } from 'ts-expect';
import { expectType } from 'ts-expect';
import type { CreatePagesConfig, SearchCodecsConfig } from 'waku/router';
import { Link, useRouter } from 'waku/router/client';

expectType<TypeEqual<keyof CreatePagesConfig, never>>(true);
expectType<TypeEqual<keyof SearchCodecsConfig, never>>(true);

export function ManualRawNavigationProbe({ unknown }: { unknown: string }) {
  const router = useRouter();
  void router.push('/products/42?tab=details#price');
  void router.replace('/about/#top');
  router.prefetch('/docs/api');
  // @ts-expect-error RouteConfig alone constrains raw push hrefs
  void router.push('/missing');
  // @ts-expect-error RouteConfig alone constrains raw replace hrefs
  void router.replace('/missing');
  // @ts-expect-error RouteConfig alone constrains raw prefetch hrefs
  router.prefetch('/missing');
  // @ts-expect-error a widened string is not a configured href
  void router.replace(unknown);

  return (
    <>
      <Link to="/about?tab=details#top">About</Link>
      <Link to="?tab=details">Query</Link>
      <Link to="#top">Hash</Link>
      {/* @ts-expect-error RouteConfig alone constrains raw Link hrefs */}
      <Link to="/missing">Missing</Link>
      {/* @ts-expect-error a widened string is not a configured href */}
      <Link to={unknown}>Unknown</Link>
    </>
  );
}
