import type { Unstable_RouteHref } from 'waku/router/client';
import { unstable_redirect as redirect } from 'waku/router/server';

// Type-level assertions only; never called (arrows avoid the `never` return
// making later statements unreachable). RouteConfig.paths is augmented by the
// generated pages.gen.ts, so a computed string is rejected; callers pass a
// known href, a structured target, or cast via `as Unstable_RouteHref`.
export const assertRedirectTyping = (computed: string) => [
  () => redirect('/bar'),
  () => redirect({ to: '/nested/[name]', params: { name: 'x' } }),
  // @ts-expect-error a computed string is not a known route href
  () => redirect(computed),
  () => redirect(computed as Unstable_RouteHref),
];
