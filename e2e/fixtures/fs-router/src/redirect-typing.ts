import { unstable_redirect as redirect } from 'waku/router/server';
import { nestedRoute } from './lib/routes';

export const assertRedirectTyping = (computed: string) => [
  () => redirect('/bar'),
  () => redirect(nestedRoute({ params: { name: 'x' } })),
  // @ts-expect-error a computed string is not a known route href
  () => redirect(computed),
  () => redirect(computed as Parameters<typeof redirect>[0]),
];
