'use client';

import cx from 'clsx';
import { useAtomValue } from 'jotai';

import { scrolledAtom } from '../atoms/index.js';
import { scrollTo } from '../utils/index.js';

export const Start = () => {
  const hasScrolled = useAtomValue(scrolledAtom);

  return (
    <div
      className={cx(
        'pt-8 text-center text-white transition-opacity duration-500 ease-in-out',
        !hasScrolled ? 'opacity-100' : 'opacity-0',
      )}
    >
      <h1 className="text-shadow -ml-1.5 font-serif text-8xl font-extrabold leading-none sm:-ml-3 sm:text-[10rem]">
        Waku
      </h1>
      <h3 className="text-shadow text-xl font-bold leading-none text-white/80 sm:-mt-2 sm:text-3xl">
        The minimal React framework
      </h3>
      <div className="mt-4 px-12 sm:mt-4 sm:px-0">
        <button
          onClick={() => scrollTo('content')}
          className="text-red-50 rounded-md bg-primary-700 px-6 py-3 text-xl font-black uppercase leading-none tracking-wide transition-colors duration-300 ease-in-out hover:bg-primary-500 focus:ring-4 focus:ring-primary-300 sm:px-8 sm:py-4 sm:text-2xl"
        >
          Start
        </button>
      </div>
    </div>
  );
};
