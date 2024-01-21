'use client';

import cx from 'clsx';
import { useAtomValue } from 'jotai';

import { scrolledAtom } from '../atoms/index.js';

type FadeProps = {
  always?: boolean;
};

export const Fade = ({ always = false }: FadeProps) => {
  const hasScrolled = useAtomValue(scrolledAtom);

  return (
    <div
      className={cx(
        'pointer-events-none fixed inset-0 z-0 transition-opacity duration-500 ease-in-out',
        always || hasScrolled ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="absolute inset-0 backdrop-blur" />
      <div className="absolute inset-0 bg-gray-900/75" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />
    </div>
  );
};
