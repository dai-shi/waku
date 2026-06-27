import { unstable_redirect as redirect } from 'waku/router/server';

export default function RedirectPage() {
  return redirect('/static');
}

export const getConfig = async () => ({ render: 'dynamic' as const });
