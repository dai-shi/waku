import { unstable_redirect as redirect } from 'waku/router/server';

export default function BouncePage({ query = '' }: { query?: string }) {
  const v = new URLSearchParams(query).get('v');
  if (v === 'a') {
    redirect('/bounce?v=b');
  }
  if (v === 'b') {
    redirect('/bounce?v=a');
  }
  return <h1 data-testid="bounce">Bounce {v ?? ''}</h1>;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
