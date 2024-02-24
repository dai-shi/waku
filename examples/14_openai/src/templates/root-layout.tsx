import '../styles.css';

import { Toaster } from 'sonner';
import type { ReactNode } from 'react';

import { Footer } from '../components/footer.js';
import { Provider } from '../components/provider.js';

type RootLayoutProps = { children: ReactNode };

export const RootLayout = async ({ children }: RootLayoutProps) => {
  const data = await getData();

  return (
    <div id="__waku">
      <meta property="description" content={data.description} />
      <link rel="icon" type="image/png" href={data.icon} />
      <main>
        <Provider />
        {children}
      </main>
      <Footer />
    </div>
  );
};

const getData = async () => {
  const data = {
    description: 'An internet website!',
    icon: '/images/favicon.png',
  };

  return data;
};
