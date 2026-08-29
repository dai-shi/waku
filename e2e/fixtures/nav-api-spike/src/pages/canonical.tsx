import { unstable_redirect as redirect } from 'waku/router/server';

export default function CanonicalPage({ query = '' }: { query?: string }) {
  const v = new URLSearchParams(query).get('v');
  if (v === 'old') {
    redirect('/canonical?v=new');
  }
  return <h1 data-testid="canonical">Canonical {v ?? ''}</h1>;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
