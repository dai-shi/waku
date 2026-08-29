import { unstable_redirect as redirect } from 'waku/router/server';

export default function OldPage() {
  redirect('/new');
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
