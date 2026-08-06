import { Suspense } from 'react';
import { unstable_createCustomError as createCustomError } from 'waku/minimal/server';

const Late = async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  throw createCustomError('leaving late', {
    status: 303,
    location: new URL(
      '/from-late',
      String(process.env.WAKU_E2E_EXTERNAL_ORIGIN),
    ).href,
  });
};

export default async function ExternalLatePage() {
  return (
    <div>
      <h1>External Late Page</h1>
      <Suspense fallback={<p>loading</p>}>
        <Late />
      </Suspense>
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
