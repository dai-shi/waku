'use client';

import cx from 'classnames';
import { Link } from 'waku';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

import { menuAtom, destinationAtom, scrolledAtom } from '../atoms';
import { Logo } from '../components/logo';
import { Sponsors } from '../components/sponsors';
import { scrollTo } from '../utils';
import { Icon } from './icon';

type NavigationProps = {
  isHome: boolean;
};

export const Navigation = ({ isHome }: NavigationProps) => {
  const [isMenuOpen, setIsMenuOpen] = useAtom(menuAtom);
  const hasScrolled = useAtomValue(scrolledAtom);

  return (
    <nav
      className={cx(
        isMenuOpen
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0',
        isHome && !hasScrolled
          ? '2xl:pointer-events-none 2xl:opacity-0'
          : '2xl:pointer-events-auto 2xl:opacity-100',
        'fixed inset-0 z-90 flex-shrink-0 flex-col overflow-clip border-gray-800 bg-gray-950 transition-opacity duration-300 ease-in-out 2xl:pointer-events-auto 2xl:bottom-auto 2xl:left-16 2xl:right-auto 2xl:top-16 2xl:z-[9999] 2xl:h-[calc(100svh-8rem)] 2xl:w-[304px] 2xl:rounded-xl 2xl:border',
      )}
    >
      <div className="relative z-10 flex h-full max-h-full w-full flex-shrink-0 flex-col items-center justify-start gap-12 !overflow-y-scroll p-8 text-white md:p-12">
        <div>
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
          <div className="text-shadow mt-3 whitespace-nowrap text-center text-sm font-bold leading-none text-white/80">
            The minimal React framework
          </div>
        </div>
        <div className="relative flex max-h-full w-full max-w-xs flex-grow flex-col gap-2 md:left-auto 2xl:gap-1.5">
          {docs.map((link) => {
            return isHome ? (
              <DocLink key={link.to} link={link} />
            ) : (
              <HomeLink key={link.to} link={link} />
            );
          })}
        </div>
        <ul className="relative z-100 flex w-full max-w-xs flex-shrink-0 flex-col justify-center gap-4 text-center">
          {links.map((link) => {
            return <MenuLink key={link.to} link={link} />;
          })}
          <Sponsors />
        </ul>
      </div>
    </nav>
  );
};

const logoClassNames = `mx-auto block w-full max-w-[12.5rem]`;

type LinkProps = {
  link: {
    to?: string;
    icon?: string;
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

const linkClassNames = `block text-balance font-simple text-[11px] font-bold uppercase tracking-[0.125em] text-gray-500 transition duration-300 ease-in-out hover:text-white p-1 2xl:p-0 !whitespace-nowrap`;

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
          'flex items-center gap-4 rounded-md bg-gray-900 px-4 py-3 text-white transition-colors duration-300 ease-in-out hover:bg-white hover:text-black',
        )}
      >
        {link.icon && (
          <Icon
            icon={link.icon}
            className="size-6 flex-shrink-0 fill-current object-contain"
          />
        )}
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
  { to: '/blog', icon: 'book', label: 'Blog' },
  {
    to: 'https://github.com/dai-shi/waku',
    icon: 'github',
    label: 'GitHub',
  },
  { to: 'https://discord.gg/MrQdmzd', icon: 'discord', label: 'Discord' },
];
