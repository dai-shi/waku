import { unstable_redirect as redirect } from 'waku/router/server';

export default function ThrowRedirectPage() {
  return redirect('/exists');
}

export const getConfig = async () => ({ render: 'dynamic' as const });
