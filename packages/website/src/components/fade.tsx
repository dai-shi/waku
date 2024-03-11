'use client';

import cx from 'classnames';
import { useAtomValue } from 'jotai';

import { scrolledAtom } from '../atoms/index.js';

type FadeProps = {
  always?: boolean;
};

export const Fade = ({ always = true }: FadeProps) => {
  const hasScrolled = useAtomValue(scrolledAtom);

  return (
    <div
      className={cx(
        'pointer-events-none fixed left-0 right-0 top-0 z-0 h-lvh transition-opacity duration-500 ease-in-out xl:inset-0 xl:h-full',
        always || hasScrolled ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="absolute inset-0 backdrop-blur" />
      <div className="absolute inset-0 bg-gray-900/75" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />
    </div>
  );
};
