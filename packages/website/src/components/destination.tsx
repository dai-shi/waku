'use client';

import { useEffect } from 'react';
import { useAtom } from 'jotai';

import { destinationAtom } from '../atoms';
import { scrollTo } from '../utils';

export const Destination = () => {
  const [destination, setDestination] = useAtom(destinationAtom);

  useEffect(() => {
    if (destination === 'nudge') {
      setTimeout(() => {
        scrollTo('nudge');
        setDestination('');
      }, 50);
      setTimeout(() => {
        scrollTo('top');
      }, 100);
    } else if (destination) {
      setTimeout(() => {
        scrollTo(destination);
        setDestination('');
      }, 800);
    }
  }, [destination, setDestination]);

  return <></>;
};
