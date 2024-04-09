'use client';

import { useRef } from 'react';
import cx from 'classnames';
import { Link } from 'waku';
import { useAtom, useSetAtom } from 'jotai';

import { menuAtom, destinationAtom } from '../atoms';
import { Logo } from '../components/logo';
import { Sponsors } from '../components/sponsors';
import { useOnClickOutside, useOnEscape } from '../hooks';
import { scrollTo } from '../utils';

type MenuProps = {
  isHome: boolean;
};

export const Menu = ({ isHome }: MenuProps) => {
  const [isMenuOpen, setIsMenuOpen] = useAtom(menuAtom);

  const ref = useRef(null);

  useOnEscape(() => setIsMenuOpen(false));
  useOnClickOutside(() => setIsMenuOpen(false), ref);

  return (
    <div ref={ref}>
      <div className="fixed right-0 top-0 z-100 p-5 lg:p-8">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={cx(
            isMenuOpen
              ? 'lg:pointer-events-none lg:opacity-0'
              : 'pointer-events-auto opacity-100 lg:delay-300',
            'group relative inline-flex aspect-square h-[3.5rem] w-[3.5rem] items-center justify-center overflow-clip rounded-full border-4 border-gray-950 text-3xl transition-opacity duration-300 ease-in-out focus:ring-4 focus:ring-primary-300 lg:focus:ring-0',
          )}
        >
          <div className="h-full w-full bg-gray-950 p-2.5 transition duration-300 ease-in-out group-hover:bg-gray-900">
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
        className={cx(
          isMenuOpen
            ? 'pointer-events-auto opacity-100 lg:delay-300'
            : 'pointer-events-none opacity-0',
          'fixed inset-0 z-90 flex shrink-0 items-start overscroll-none border-gray-800 bg-gray-950 p-8 transition-opacity duration-300 ease-in-out md:items-center md:justify-center md:p-12 lg:bottom-auto lg:left-auto lg:right-4 lg:top-4 lg:z-[9999] lg:overflow-clip lg:rounded-xl lg:border',
        )}
      >
        <div className="relative z-10 flex h-full w-full shrink-0 flex-col items-center gap-4 text-white md:justify-center md:gap-8">
          <div className="flex w-full justify-center">
            {isHome ? (
              <button
                onClick={() => {
                  scrollTo('top');
                  setIsMenuOpen(false);
                }}
                className={logoClassNames}
              >
                <Logo />
              </button>
            ) : (
              <Link
                to="/"
                onClick={() => setIsMenuOpen(false)}
                className={logoClassNames}
              >
                <Logo />
              </Link>
            )}
          </div>
          <div className="relative flex max-h-full w-full flex-grow flex-col gap-2 overflow-y-scroll md:left-auto md:overflow-y-auto lg:gap-1">
            {docs.map((link) => {
              return isHome ? (
                <DocLink key={link.to} link={link} />
              ) : (
                <HomeLink key={link.to} link={link} />
              );
            })}
          </div>
          <ul className="relative z-100 flex w-full flex-shrink-0 justify-center gap-4 text-center">
            {links.map((link) => {
              return <MenuLink key={link.to} link={link} />;
            })}
          </ul>
          <Sponsors className="-mt-4 sm:mt-8 lg:hidden" always={true} />
        </div>
      </nav>
    </div>
  );
};

const logoClassNames = `md:mx-auto max-w-[6.25rem] block w-full md:max-w-[12.5rem]`;

type LinkProps = {
  link: {
    to?: string;
    label: string;
    disabled?: boolean;
  };
};

const HomeLink = ({ link }: LinkProps) => {
  const setIsMenuOpen = useSetAtom(menuAtom);
  const setDestination = useSetAtom(destinationAtom);

  return (
    <div>
      <Link
        to="/"
        onClick={() => {
          setDestination(link.to?.split('/#')?.[1] as string);
          setIsMenuOpen(false);
        }}
        className={linkClassNames}
      >
        {link.label}
      </Link>
    </div>
  );
};

const DocLink = ({ link }: LinkProps) => {
  const setIsMenuOpen = useSetAtom(menuAtom);

  return (
    <div>
      <button
        onClick={() => {
          scrollTo(link.to?.split('/#')?.[1] as string);
          setIsMenuOpen(false);
        }}
        className={linkClassNames}
      >
        {link.label}
      </button>
    </div>
  );
};

const linkClassNames = `block text-balance font-simple text-[11px] font-bold uppercase tracking-[0.125em] text-gray-500 transition duration-300 ease-in-out hover:text-white p-1 lg:p-0`;

export const MenuLink = ({ link }: LinkProps) => {
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
    <li className="contents">
      <Element
        {...props}
        onClick={() => setIsMenuOpen(false)}
        className={cx(
          'text-white transition-colors duration-300 ease-in-out hover:text-secondary',
        )}
      >
        <span className="text-base font-bold">{link.label}</span>
      </Element>
    </li>
  );
};

const docs = [
  { to: '/#introduction', label: 'Introduction' },
  { to: '/#getting-started', label: 'Getting Started' },
  { to: '/#rendering', label: 'Rendering' },
  { to: '/#routing', label: 'Routing' },
  { to: '/#navigation', label: 'Navigation' },
  { to: '/#metadata', label: 'Metadata' },
  { to: '/#styling', label: 'Styling' },
  { to: '/#static-assets', label: 'Static Assets' },
  { to: '/#file-system', label: 'File System' },
  { to: '/#data-fetching', label: 'Data Fetching' },
  { to: '/#state-management', label: 'State Management' },
  { to: '/#environment-variables', label: 'Environment Variables' },
  { to: '/#deployment', label: 'Deployment' },
  { to: '/#community', label: 'Community' },
  { to: '/#roadmap', label: 'Roadmap' },
];

const links = [
  { to: '/blog', label: 'Blog' },
  { to: 'https://github.com/dai-shi/waku', label: 'GitHub' },
  { to: 'https://discord.gg/MrQdmzd', label: 'Discord' },
];
