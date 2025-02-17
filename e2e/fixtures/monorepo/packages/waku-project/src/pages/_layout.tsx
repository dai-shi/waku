import type { ReactNode } from 'react';

import { Header } from '../components/header';
import { Footer } from '../components/footer';

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  const data = await getData();

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <meta name="description" content={data.description} />
      <link rel="icon" type="image/png" href={data.icon} />
      <Header />
      <main style={{ margin: 40, display: 'flex', justifyContent: 'center' }}>
        {children}
      </main>
      <Footer />
    </div>
  );
}

const getData = async () => {
  const data = {
    description: 'An internet website!',
    icon: '/images/favicon.png',
  };

  return data;
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
