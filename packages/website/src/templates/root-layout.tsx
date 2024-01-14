import '../styles.css';

import type { ReactNode } from 'react';

import { Providers } from '../components/providers.js';
import { Analytics } from '../components/analytics.js';

type RootLayoutProps = { children: ReactNode };

export const RootLayout = async ({ children }: RootLayoutProps) => {
  return (
    <Providers>
      <Meta />
      <div id="__waku">{children}</div>
      <Analytics />
    </Providers>
  );
};

const Meta = () => {
  return (
    <>
      <meta property="description" content="The minimal React framework" />
      <meta property="og:locale" content="en" />
      <meta property="og:site_name" content="Waku" />
      <meta property="og:title" content="Waku" />
      <meta property="og:description" content="The minimal React framework" />
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
