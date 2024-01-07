'use client';

import { scrollTo } from '../utils/index.js';

export const Start = () => {
  return (
    <button
      onClick={() => scrollTo('readme')}
      className="bg-primary-700 focus:ring-primary-300 hover:bg-primary-500 rounded-md px-6 py-3 text-xl font-black uppercase leading-none tracking-wide text-red-50 transition duration-300 ease-in-out focus:ring-4 sm:px-8 sm:py-4 sm:text-2xl"
    >
      Enter
    </button>
  );
};
