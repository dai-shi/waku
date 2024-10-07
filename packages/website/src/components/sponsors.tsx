'use client';

import { useState } from 'react';
import cx from 'classnames';

import { useInterval } from '../hooks';

type SponsorsProps = {
  className?: string;
};

const INTERVAL = 7_500;

export const Sponsors = ({ className = '' }: SponsorsProps) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  useInterval(() => {
    setActiveIndex((prevIndex) => (prevIndex + 1) % sponsors.length);
  }, INTERVAL);

  if (import.meta.env.WAKU_PUBLIC_SHOW_SPONSORS !== 'YES') {
    return null;
  }

  return (
    <div className={cx('pointer-events-none relative w-full', className)}>
      <div
        className={cx(
          'group pointer-events-auto flex w-full origin-center scale-75 flex-col items-center gap-[4px] sm:scale-100',
        )}
      >
        <span
          className={cx(
            'font-simple text-[11px] uppercase tracking-[0.125em] text-gray-500 transition-colors duration-300 ease-in-out group-hover:text-white',
          )}
        >
          sponsored by
        </span>
        <div className="relative w-full">
          {sponsors.map((sponsors, index) => {
            return (
              <a
                key={index}
                href={sponsors.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cx(
                  'transition-opacity duration-1000 ease-in-out',
                  index !== activeIndex
                    ? 'pointer-events-none opacity-0'
                    : 'delay-500',
                  index !== 0 && 'absolute inset-0 h-full w-full',
                )}
              >
                <div className="absolute left-0 right-0 top-0 h-[20px] -translate-y-full" />
                <img
                  src={sponsors.logo}
                  alt={sponsors.title}
                  className="block h-[20px] w-full object-contain"
                />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const sponsors = [
  {
    title: 'Vercel',
    logo: 'https://cdn.candycode.com/waku/vercel.svg',
    url: 'https://vercel.com/home',
  },
  {
    title: 'Progress KendoReact',
    logo: 'https://cdn.candycode.com/waku/sponsors/kendo-react.png',
    url: 'https://www.telerik.com/kendo-react-ui?utm_medium=referral&utm_source=waku&utm_campaign=waku-sponsorship',
  },
];
