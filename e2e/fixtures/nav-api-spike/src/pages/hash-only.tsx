import { unstable_redirect as redirect } from 'waku/router/server';

export default function HashOnlyPage() {
  redirect('/hash-only#details');
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
