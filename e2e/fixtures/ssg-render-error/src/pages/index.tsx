import { Suspense } from 'react';

const Throws = async () => {
  await Promise.resolve();
  throw new Error('Unexpected error inside Suspense');
};

export default function HomePage() {
  return (
    <div>
      <p>Home Page</p>
      <Suspense fallback={<p>Loading...</p>}>
        <Throws />
      </Suspense>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
