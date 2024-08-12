import '../styles.css';

import type { ReactNode } from 'react';

import { Providers } from '../components/providers';
import { Analytics } from '../components/analytics';

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <html>
      <head></head>
      <body>
        <Providers>
          <Meta />
          <div id="__waku">{children}</div>
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}

const Meta = () => {
  return (
    <>
      <meta property="og:locale" content="en" />
      <meta property="og:site_name" content="Waku" />
      <meta property="og:type" content="website" />
      <meta
        property="og:image"
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

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
