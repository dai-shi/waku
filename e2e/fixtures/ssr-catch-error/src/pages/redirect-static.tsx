import { unstable_redirect as redirect } from 'waku/router/server';

const Redirect = async () => {
  await Promise.resolve();
  return redirect('/no-error');
};

export default function RedirectStaticPage() {
  return <Redirect />;
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
