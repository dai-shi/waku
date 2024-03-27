'use client';

import { useEffect } from 'react';
import { useAtom } from 'jotai';

import { destinationAtom } from '../atoms/index.js';
import { scrollTo } from '../utils/index.js';

export const Destination = () => {
  const [destination, setDestination] = useAtom(destinationAtom);

  useEffect(() => {
    if (destination) {
      setTimeout(() => {
        scrollTo(destination);
        setDestination('');
      }, 800);
    }
  }, [destination, setDestination]);

  return <></>;
};
