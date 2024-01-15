import type { ReactNode } from 'react';

import { Menu } from '../components/menu.js';
import { Fade } from './fade.js';
import { Credits } from '../components/credits.js';
import { Scroll } from './scroll.js';

type PageProps = {
  isFaded?: boolean;
  children: ReactNode;
};

export const Page = ({ isFaded = true, children }: PageProps) => {
  return (
    <>
      <Menu />
      <Background />
      <Fade always={isFaded} />
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
  return <main className="px-8 pb-24 lg:pb-32">{children}</main>;
};

const Background = () => {
  return (
    <div className="fixed inset-0 z-0">
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
