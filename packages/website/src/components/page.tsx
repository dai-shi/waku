import type { ReactNode } from 'react';

import { Menu } from '../components/menu';
import { Fade } from '../components/fade';
import { Credits } from '../components/credits';
import { Scroll } from '../components/scroll';
import { Navigation } from './navigation';

type PageProps = {
  isHome?: boolean;
  children: ReactNode;
};

export const Page = async ({ isHome = false, children }: PageProps) => {
  return (
    <>
      <Menu />
      <Background />
      <Fade always={!isHome} />
      <Navigation isHome={isHome} />
      <Main>{children}</Main>
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
