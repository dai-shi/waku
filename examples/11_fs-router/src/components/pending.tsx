'use client';

import { useNavigationStatus_UNSTABLE as useNavigationStatus } from 'waku/router/client';

export const Pending = () => {
  const { pending } = useNavigationStatus();
  return (
    <span
      style={{
        marginLeft: 5,
        transition: 'opacity 75ms 100ms',
        opacity: pending ? 1 : 0,
      }}
    >
      Pending...
    </span>
  );
};
