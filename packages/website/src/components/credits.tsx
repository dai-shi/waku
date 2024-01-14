import { getEnv } from 'waku/server';

export const Credits = () => {
  if (getEnv('SHOW_CREDITS') !== 'YES') return null;

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 flex w-full items-center justify-between p-[16px]">
      <a
        href="https://vercel.com/home"
        target="_blank"
        rel="noopener noreferrer"
        className="group pointer-events-auto inline-flex origin-bottom-left scale-75 flex-col items-center rounded-md bg-black p-[16px] sm:scale-100"
      >
        <span className="mb-[4px] font-simple text-[11px] uppercase tracking-[0.125em] text-gray-600 transition-colors duration-300 ease-in-out group-hover:text-white">
          sponsored by
        </span>
        <img
          src="https://cdn.candycode.com/waku/vercel.svg"
          alt="Vercel"
          className="h-[20px] w-auto object-contain"
        />
      </a>
      <a
        href="https://candycode.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="group pointer-events-auto inline-flex origin-bottom-right scale-75 flex-col items-center rounded-md bg-black p-[16px] sm:scale-100"
      >
        <span className="mb-[4px] font-simple text-[11px] text-xs uppercase tracking-[0.125em] text-gray-600 transition-colors duration-300 ease-in-out group-hover:text-white">
          website by
        </span>
        <img
          src="https://storage.googleapis.com/candycode/candycode.svg"
          alt="candycode, an alternative graphic design and web development agency based in San Diego"
          className="h-[20px] w-[104px]"
        />
      </a>
    </div>
  );
};
