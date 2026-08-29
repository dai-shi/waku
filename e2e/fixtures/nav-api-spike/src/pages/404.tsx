import { unstable_redirect as redirect } from 'waku/router/server';

export default function NotFoundPage({ query = '' }: { query?: string }) {
  const params = new URLSearchParams(query);
  if (params.get('mix') === '1') {
    redirect('/mix-b?mix=1' as '/');
  }
  const cycle = params.get('mixcycle');
  if (cycle === 'a') {
    redirect('/mix-b?mixcycle=b' as '/');
  }
  if (cycle === 'b') {
    redirect('/mix-b?mixcycle=a' as '/');
  }
  return <h1 data-testid="not-found">Custom 404</h1>;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
