'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type ClientOnlyProps = {
  children: ReactNode;
};

export const ClientOnly = ({ children }: ClientOnlyProps) => {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return children;
};
