/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { useScroll } from 'framer-motion';

import { scrolledAtom } from '../atoms';

export const Scroll = () => {
  const { scrollY } = useScroll();
  const setHasScrolled = useSetAtom(scrolledAtom);

  useEffect(() => {
    return scrollY.on('change', (latest) => {
      if (latest >= 100) {
        setHasScrolled(true);
      } else {
        setHasScrolled(false);
      }
    });
  }, []);

  return null;
};
