'use client';

import cx from 'classnames';
import { useAtom } from 'jotai';

import { menuAtom } from '../atoms';
import { useOnEscape } from '../hooks';

export const Menu = () => {
  const [isMenuOpen, setIsMenuOpen] = useAtom(menuAtom);

  useOnEscape(() => setIsMenuOpen(false));

  return (
    <>
      <div className="fixed right-0 top-0 z-100 p-5 2xl:hidden">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={cx(
            'group relative inline-flex aspect-square h-[3.5rem] w-[3.5rem] items-center justify-center overflow-clip rounded-full border-4 border-gray-950 text-3xl transition-opacity duration-300 ease-in-out focus:ring-4 focus:ring-primary-300 lg:focus:ring-0',
          )}
        >
          <div className="h-full w-full bg-gray-900 p-2.5 transition duration-300 ease-in-out group-hover:bg-gray-950">
            <img
              key="menu"
              src="https://cdn.candycode.com/waku/shinto-shrine.png"
              alt="Menu"
              className="h-full w-full object-contain"
            />
          </div>
        </button>
      </div>
    </>
  );
};
