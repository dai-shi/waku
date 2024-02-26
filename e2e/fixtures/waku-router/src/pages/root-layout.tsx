import type { ReactNode } from 'react';
import { CurrentUrl } from '../components/current-url.js';

type RootLayoutProps = {
  children: ReactNode;
};

export const RootLayout = async ({ children }: RootLayoutProps) => {
  return (
    <div id="__waku">
      <CurrentUrl />
      <main>{children}</main>
    </div>
  );
};
