import { unstable_redirect as redirect } from 'waku/router/server';

export default async function ExternalPage() {
  // the spec listens on this origin and passes it in when it starts the app
  redirect(
    new URL('/from-render', String(process.env.WAKU_E2E_EXTERNAL_ORIGIN)),
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
