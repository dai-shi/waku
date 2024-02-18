'use client';

import { useRef } from 'react';
import { Link } from 'waku';
import { useAtom, useSetAtom } from 'jotai';
import cx from 'clsx';

import { menuAtom } from '../atoms/index.js';
import { Logo } from '../components/logo.js';
import { Sponsors } from '../components/sponsors.js';
import { useOnClickOutside, useOnEscape } from '../hooks/index.js';

export const Menu = () => {
  const [isMenuOpen, setIsMenuOpen] = useAtom(menuAtom);

  const ref = useRef(null);

  useOnEscape(() => setIsMenuOpen(false));
  useOnClickOutside(() => setIsMenuOpen(false), ref);

  return (
    <>
      <div className="fixed right-0 top-0 z-100 p-5 lg:p-8">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={cx(
            isMenuOpen
              ? 'pointer-events-none opacity-0'
              : 'pointer-events-auto opacity-100 lg:delay-300',
            'inline-flex aspect-square h-[3.5rem] w-[3.5rem] items-center justify-center overflow-clip rounded-full border-4 border-gray-950 bg-gray-900 text-3xl transition duration-300 ease-in-out hover:bg-gray-800 focus:ring-4 focus:ring-primary-300 lg:focus:ring-0',
          )}
        >
          <div className="h-full w-full p-2.5">
            <img
              key="menu"
              src="https://cdn.candycode.com/waku/shinto-shrine.png"
              alt="Menu"
              className="h-full w-full object-contain"
            />
          </div>
        </button>
      </div>
      <nav
        ref={ref}
        className={cx(
          isMenuOpen
            ? 'pointer-events-auto opacity-100 lg:delay-300'
            : 'pointer-events-none opacity-0',
          'fixed inset-0 z-90 flex max-h-full items-center justify-center overflow-y-auto overscroll-none border-gray-800 bg-gray-950 transition-opacity duration-300 ease-in-out lg:bottom-auto lg:left-auto lg:right-4 lg:top-4 lg:z-100 lg:overflow-clip lg:rounded-xl lg:border lg:p-12 lg:backdrop-blur',
        )}
      >
        <div className="relative z-10 flex flex-col items-center justify-center text-white">
          <div className="hidden w-full pb-12 2xl:flex">
            <div className="mx-auto block w-full">
              <Logo className="lg:!max-w-[12.5rem]" />
            </div>
          </div>
          <ul className="relative z-100 flex flex-shrink-0 flex-col gap-4 text-center">
            {links.map((link) => {
              return <MenuLink key={link.to} link={link} />;
            })}
          </ul>
          <Sponsors className="mt-0 sm:mt-8 lg:hidden" always={true} />
        </div>
      </nav>
    </>
  );
};

type MenuLinkProps = {
  link: {
    to?: string;
    label: string;
    disabled?: boolean;
  };
};

export const MenuLink = ({ link }: MenuLinkProps) => {
  const setIsMenuOpen = useSetAtom(menuAtom);

  let Element: any = 'button';
  const props: any = {};

  if (link.to) {
    if (link.to.startsWith('http')) {
      Element = 'a';
      props.href = link.to;
      props.target = '_blank';
      props.rel = 'noopener noreferrer';
    } else {
      Element = Link;
      props.to = link.to;
    }
  }

  if (link.disabled) {
    Element = 'div';
  }

  return (
    <li>
      <Element
        {...props}
        onClick={() => setIsMenuOpen(false)}
        className={cx(
          'flex items-center gap-4 rounded-md border border-gray-800 bg-black px-4 py-3 transition-colors duration-300 ease-in-out focus:ring-4 focus:ring-primary-300',
          !link.disabled
            ? 'text-white hover:border-secondary'
            : 'cursor-not-allowed text-white/40',
        )}
      >
        <span className="text-2xl font-bold">{link.label}</span>
        {link.disabled && (
          <span className="inline-block origin-left scale-75 whitespace-nowrap rounded-md bg-white px-2 py-1 text-[0.625rem] font-black uppercase tracking-wide text-black">
            Coming soon
          </span>
        )}
      </Element>
    </li>
  );
};

const links = [
  { to: '/', label: 'Home' },
  { to: '/blog', label: 'Blog' },
  { to: 'https://github.com/dai-shi/waku/issues/24', label: 'Roadmap' },
  { to: '/docs', label: 'Docs', disabled: true },
  { to: 'https://github.com/dai-shi/waku', label: 'GitHub' },
  { to: 'https://discord.gg/MrQdmzd', label: 'Discord' },
];
