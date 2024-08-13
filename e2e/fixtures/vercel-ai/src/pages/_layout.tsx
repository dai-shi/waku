import '../styles.css';

import type { ReactNode } from 'react';

import { Header } from '../components/header.js';
import { TooltipProvider } from '../components/ui/tooltip.js';

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  const data = await getData();
  return (
    <div className="font-sans">
      <meta property="description" content={data.description} />
      <link rel="icon" type="image/png" href={data.icon} />
      <TooltipProvider>
        <Header />
        <main className="bg-muted/50 dark:bg-background flex flex-1 flex-col">
          {children}
        </main>
      </TooltipProvider>
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
