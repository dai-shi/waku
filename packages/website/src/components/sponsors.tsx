'use client';

import cx from 'classnames';

type SponsorsProps = {
  className?: string;
};

export const Sponsors = ({ className = '' }: SponsorsProps) => {
  if (import.meta.env.WAKU_PUBLIC_SHOW_SPONSORS !== 'YES') return null;

  return (
    <div
      className={cx(
        'pointer-events-none transition-opacity duration-500 ease-in-out',
        className,
      )}
    >
      <a
        href="https://vercel.com/home"
        target="_blank"
        rel="noopener noreferrer"
        className={cx(
          'group pointer-events-auto inline-flex w-full origin-center scale-75 flex-col items-center gap-[4px] sm:scale-100',
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
