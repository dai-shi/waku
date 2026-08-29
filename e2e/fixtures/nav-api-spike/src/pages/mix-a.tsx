import { unstable_redirect as redirect } from 'waku/router/server';

export default function MixAPage() {
  // mix-b has no page; middleware answers its RSC request as HTTP 404 so
  // load 404-follows. a 200 404-page would skip that hop.
  redirect('/mix-b?mix=1' as '/');
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
