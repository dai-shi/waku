'use client';

import cx from 'classnames';
import { useAtomValue } from 'jotai';

import { scrolledAtom } from '../atoms';

type SponsorsProps = {
  always?: boolean;
  className?: string;
};

export const Sponsors = ({ always = false, className = '' }: SponsorsProps) => {
  const hasScrolled = useAtomValue(scrolledAtom);

  if (import.meta.env.WAKU_PUBLIC_SHOW_SPONSORS !== 'YES') return null;

  return (
    <div
      className={cx(
        'pointer-events-none transition-opacity duration-500 ease-in-out',
        always || !hasScrolled ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      <a
        href="https://vercel.com/home"
        target="_blank"
        rel="noopener noreferrer"
        className={cx(
          'group pointer-events-auto inline-flex origin-center scale-75 flex-col items-center gap-[4px] rounded-md bg-black/50 p-[16px] sm:scale-100 sm:bg-black',
        )}
      >
        <span
          className={cx(
            'font-simple text-[11px] uppercase tracking-[0.125em] text-gray-500 transition-colors duration-300 ease-in-out group-hover:text-white',
          )}
        >
          sponsored by
        </span>
        <img
          src="https://cdn.candycode.com/waku/vercel.svg"
          alt="Vercel"
          className="h-[20px] w-auto object-contain"
        />
      </a>
    </div>
  );
};
