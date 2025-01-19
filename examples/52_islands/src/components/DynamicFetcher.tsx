'use client';

import { useEffect } from 'react';
import { useRefetch } from 'waku/minimal/client';

export const DynamicFetcher = () => {
  const refetch = useRefetch();
  useEffect(() => {
    refetch('Dynamic');
  }, [refetch]);
  return null;
};
