import { unstable_redirect as redirect } from 'waku/router/server';

export default async function SyncPage() {
  await new Promise((resolve) => setTimeout(resolve, 100));
  redirect('/destination');
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
