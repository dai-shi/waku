'use client';

import { useEffect, useCallback, useRef } from 'react';

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

export const useOnClickOutside = (
  handler: (event: Event) => void,
  node: React.RefObject<HTMLElement>,
) => {
  useEffect(() => {
    const listener = (event: Event) => {
      if (!node.current || node.current.contains(event.target as Node)) {
        return;
      }

      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [handler, node]);
};

export const useInterval = (callback: () => void, delay: number) => {
  const intervalRef = useRef<any>(null);

  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const tick = () => savedCallback.current();

    if (typeof delay === 'number') {
      intervalRef.current = window.setInterval(tick, delay);
      return () => window.clearInterval(intervalRef.current);
    }
  }, [delay]);

  return intervalRef;
};
