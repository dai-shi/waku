import type { ReactNode } from 'react';
import { Children } from 'waku/minimal/client';
import { CookieInfo } from './CookieInfo';
import { Island } from './Island';
import { JotaiApp } from './JotaiApp';
// eslint-disable-next-line import/no-unresolved
import { Counter } from '@/components/Counter';

export function App({
  name,
  mode,
  rscParams,
  children,
}: {
  name: string;
  mode: 'basic' | 'children' | 'islands' | 'jotai' | 'cookie';
  rscParams?: unknown;
  children?: ReactNode;
}) {
  return (
    <html>
      <head>
        <title>Waku minimal examples</title>
      </head>
      <body>
        <h1 data-testid="title">Hello {name}</h1>
        {mode === 'basic' && <Counter />}
        {mode === 'children' && (
          <section>
            <p data-testid="children-marker">server children wrapper</p>
            <Children />
            {children}
          </section>
        )}
        {mode === 'islands' && <Island />}
        {mode === 'jotai' && <JotaiApp rscParams={rscParams} />}
        {mode === 'cookie' && <CookieInfo />}
      </body>
    </html>
  );
}
