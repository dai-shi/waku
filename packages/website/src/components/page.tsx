import type { ReactNode } from 'react';

import { Menu } from '../components/menu.js';
import { Fade } from '../components/fade.js';
import { Sponsors } from '../components/sponsors.js';
import { Credits } from '../components/credits.js';
import { Scroll } from '../components/scroll.js';

type PageProps = {
  isHome?: boolean;
  children: ReactNode;
};

export const Page = async ({ isHome = false, children }: PageProps) => {
  return (
    <>
      <Menu isHome={isHome} />
      <Background />
      <Fade always={!isHome} />
      <Main>{children}</Main>
      <Sponsors className="fixed bottom-0 left-0 z-80 hidden p-[16px] lg:block" />
      <Credits />
      <Scroll />
    </>
  );
};

type MainProps = {
  children: ReactNode;
};

const Main = ({ children }: MainProps) => {
  return (
    <main id="top" className="px-8 pb-24 lg:pb-32">
      {children}
    </main>
  );
};

const Background = () => {
  return (
    <div className="fixed left-0 right-0 top-0 z-0 h-lvh xl:inset-0 xl:h-full">
      <div className="absolute inset-0 z-0 sm:-inset-8">
        <img
          src="https://cdn.candycode.com/waku/background.jpg"
          alt=""
          className="h-full w-full object-cover object-center"
        />
      </div>
      <div className="absolute inset-0 z-10 bg-gradient-radial from-transparent to-black/25" />
    </div>
  );
};
