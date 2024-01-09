'use client';

import { scrollTo } from '../utils/index.js';

export const Start = () => {
  return (
    <button
      onClick={() => scrollTo('content')}
      className="text-red-50 rounded-md bg-primary-700 px-6 py-3 text-xl font-black uppercase leading-none tracking-wide transition duration-300 ease-in-out hover:bg-primary-500 focus:ring-4 focus:ring-primary-300 sm:px-8 sm:py-4 sm:text-2xl"
    >
      Start
    </button>
  );
};
