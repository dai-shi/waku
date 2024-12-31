'use client';

import { useRouter_UNSTABLE } from 'waku';

export const MyButton = () => {
  const router = useRouter_UNSTABLE();
  return (
    <button onClick={() => router.push(`/static`)}>
      Static router.push button
    </button>
  );
};
