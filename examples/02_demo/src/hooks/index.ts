'use client';

import { useEffect, useCallback } from 'react';

export const useOnEscape = (handler: () => void) => {
  const handleEscape = useCallback(
    ({ code }: { code: string }) => {
      if (code === 'Escape') {
        handler();
      }
    },
    [handler],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleEscape, false);

    return () => {
      document.removeEventListener('keydown', handleEscape, false);
    };
  }, [handleEscape]);
};
