'use client';

import * as React from 'react';
import { useEffect } from 'react';

type Event = MouseEvent | TouchEvent;

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
