import '../styles.css';

import type { ReactNode } from 'react';

import { Menu } from '../components/menu.js';
import { Credits } from '../components/credits.js';

type RootLayoutProps = { children: ReactNode };

export const RootLayout = async ({ children }: RootLayoutProps) => {
  return (
    <>
      <Meta />
      <div id="__waku">
        <Menu />
        <Background />
        <Main>{children}</Main>
        <Credits />
      </div>
    </>
  );
};

const Meta = () => {
  return (
    <>
      <meta property="description" content="⛩️ The minimal React framework" />
      <meta property="og:locale" content="en" />
      <meta property="og:site_name" content="Waku" />
      <meta property="og:title" content="Waku" />
      <meta
        property="og:description"
        content="⛩️ The minimal React framework"
      />
      <meta property="og:type" content="website" />
      <meta
        property="og:image"
        content="https://cdn.candycode.com/waku/opengraph.jpg"
      />
      <meta
        property="og:image:url"
        content="https://cdn.candycode.com/waku/opengraph.jpg"
      />
      <meta
        property="og:image:secure_url"
        content="https://cdn.candycode.com/waku/opengraph.jpg"
      />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content="https://waku.gg" />
      <meta property="twitter:card" content="summary_large_image" />
      <link
        rel="icon"
        type="image/png"
        href="https://cdn.candycode.com/waku/shinto-shrine.png"
      />
    </>
  );
};

type MainProps = {
  children: ReactNode;
};

const Main = ({ children }: MainProps) => {
  return <main className="relative z-10">{children}</main>;
};

const Background = () => {
  return (
    <div className="fixed left-0 right-0 top-0 z-0 h-svh">
      <div className="absolute inset-0 z-0 sm:-inset-8">
        <img
          src="https://cdn.candycode.com/waku/background.jpg"
          alt=""
          className="h-full w-full object-cover object-center"
        />
      </div>
      <div className="absolute inset-0 z-10 h-full w-full bg-gradient-radial from-transparent to-black/25" />
    </div>
  );
};
