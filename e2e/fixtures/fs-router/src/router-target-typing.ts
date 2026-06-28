import { useRouter } from 'waku';
import type { Unstable_RouteHref } from 'waku/router/client';

type Router = ReturnType<typeof useRouter>;

// Type-level assertions only; this function is never called. RouteConfig.paths
// is augmented by the generated pages.gen.ts, so RouteHref is a literal union:
// a computed string is rejected, and callers pass a known href, a structured
// target, or cast via `as Unstable_RouteHref`.
export function assertRouterTargetTyping(router: Router, computed: string) {
  void router.prefetch('/bar');
  void router.push('/bar');
  void router.replace('/bar');
  void router.prefetch({ to: '/nested/[name]', params: { name: 'x' } });
  void router.push({ to: '/nested/[name]', params: { name: 'x' } });
  void router.replace({ to: '/nested/[name]', params: { name: 'x' } });

  // @ts-expect-error a computed string is not a known route href
  void router.prefetch(computed);
  // @ts-expect-error a computed string is not a known route href
  void router.push(computed);
  // @ts-expect-error a computed string is not a known route href
  void router.replace(computed);

  void router.prefetch(computed as Unstable_RouteHref);
  void router.push(computed as Unstable_RouteHref);
  void router.replace(computed as Unstable_RouteHref);
}
