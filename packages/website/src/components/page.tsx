import type { ReactNode } from 'react';

type PageProps = {
  hero?: ReactNode;
  children: ReactNode;
};

export const Page = ({ hero = null, children }: PageProps) => {
  return (
    <>
      {hero}
      <div className="relative pb-32">
        <div className="sticky top-0 z-10 h-0 w-full overflow-visible">
          <div className="left-0 right-0 top-0 z-10 flex h-[100svh] w-full bg-gradient-to-b from-transparent via-gray-950/75 to-gray-950" />
        </div>
        <div className="relative z-20 flex justify-center px-4">
          <div
            id="content"
            className="mx-auto mt-4 inline-block max-w-full scroll-mt-4 overflow-clip rounded-2xl border-4 border-gray-950 bg-gray-900/90 p-4 text-white backdrop-blur sm:p-8 lg:mt-32 lg:scroll-mt-32 lg:p-12"
          >
            <div className="w-full max-w-[80ch]">{children}</div>
          </div>
        </div>
      </div>
    </>
  );
};
