'use client';

import { useNavigationStatus_UNSTABLE as useNavigationStatus } from 'waku/router/client';

export const NavIndicator = ({ name }: { name?: string }) => {
  const { pending } = useNavigationStatus();
  const suffix = name ? `-${name}` : '';
  return pending ? (
    <span data-testid={`pending${suffix}-indicator`}>
      Pending transition...
    </span>
  ) : (
    <span data-testid={`not-pending${suffix}-indicator`}>Not pending</span>
  );
};
