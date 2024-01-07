'use client';

import type { ComponentPropsWithoutRef } from 'react';
// import { Link } from 'waku';
import { useAtom, useSetAtom } from 'jotai';
import cx from 'clsx';

import { menuAtom } from '../atoms/index.js';
import { useOnEscape } from '../hooks/index.js';

export const Menu = () => {
  const [isMenuOpen, setIsMenuOpen] = useAtom(menuAtom);

  useOnEscape(() => {
    setIsMenuOpen(false);
  });

  return (
    <>
      <div className="fixed bottom-0 left-0 z-100 p-8 sm:bottom-auto sm:left-auto sm:right-0 sm:top-0">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="focus:ring-primary-300 inline-flex aspect-square h-16 w-16 items-center justify-center overflow-clip rounded-full border-4 border-gray-950 bg-gray-900 text-3xl transition duration-300 ease-in-out hover:bg-gray-800 focus:ring-4"
        >
          <div className="h-full w-full p-3">
            {!isMenuOpen ? (
              <img
                src="/images/shinto-shrine.png"
                alt="Menu"
                className="h-full w-full object-contain"
              />
            ) : (
              <img
                src="/images/back.png"
                alt="Close"
                className="h-full w-full object-contain"
              />
            )}
          </div>
        </button>
      </div>
      <nav
        className={cx(
          isMenuOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0',
          'fixed inset-0 z-90 flex items-center justify-center overscroll-none bg-gray-950/90 text-white backdrop-blur transition-opacity duration-700 ease-in-out',
        )}
      >
        <ul className="flex flex-col gap-6 sm:gap-8">
          {links.map((link) => {
            return <MenuLink key={link.href} link={link} />;
          })}
        </ul>
      </nav>
    </>
  );
};

type MenuLinkProps = {
  link: {
    href: string;
    label: string;
    disabled?: boolean;
  };
};

export const MenuLink = ({ link }: MenuLinkProps) => {
  const setIsMenuOpen = useSetAtom(menuAtom);

  let Element: any = 'a'; // Switch to <Link>: ElementType
  const props: ComponentPropsWithoutRef<'a'> = {};

  props.href = link.href;

  if (link.href.startsWith('http')) {
    Element = 'a';
    props.target = '_blank';
    props.rel = 'noopener noreferrer';
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
          'focus:ring-primary-300 flex items-center gap-4 rounded-md focus:ring-4',
          !link.disabled
            ? 'text-white  transition-colors duration-300 ease-in-out hover:text-primary'
            : 'cursor-not-allowed text-white/40',
        )}
      >
        <span className="text-5xl font-bold sm:text-6xl">{link.label}</span>
        {link.disabled && (
          <span className="inline-block rounded-md bg-white px-2 py-1 text-xs font-black uppercase tracking-wide text-black sm:text-sm">
            Coming soon
          </span>
        )}
      </Element>
    </li>
  );
};

const links = [
  { href: '/', label: 'Home' },
  { href: 'https://github.com/dai-shi/waku/issues/24', label: 'Roadmap' },
  { href: '/docs', label: 'Docs', disabled: true },
  { href: '/blog', label: 'Blog', disabled: true },
  { href: 'https://github.com/dai-shi/waku', label: 'GitHub' },
  { href: 'https://discord.gg/MrQdmzd', label: 'Discord' },
];
