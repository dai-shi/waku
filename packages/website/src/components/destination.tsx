'use client';

import { useEffect } from 'react';
import { useAtom } from 'jotai';

import { destinationAtom } from '../atoms/index.js';
import { scrollTo } from '../utils/index.js';

export const Destination = () => {
  const [destination, setDestination] = useAtom(destinationAtom);

  useEffect(() => {
    if (destination) {
      scrollTo(destination);
      setDestination('');
    }
  }, [destination, setDestination]);

  return <></>;
};
