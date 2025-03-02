'use client';

import { useRouter } from 'waku';

export const MyButton = () => {
  const router = useRouter();
  return (
    <button onClick={() => router.push(`/static`)}>
      Static router.push button
    </button>
  );
};
