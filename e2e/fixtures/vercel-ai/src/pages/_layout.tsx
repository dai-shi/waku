import '../styles.css';

import type { ReactNode } from 'react';

import { Header } from '../components/header.js';
import { TooltipProvider } from '../components/ui/tooltip.js';

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  const data = await getData();
  return (
    <html>
      <head>
        <meta property="description" content={data.description} />
        <link rel="icon" type="image/png" href={data.icon} />
      </head>
      <body>
        <div className="font-sans">
          <TooltipProvider>
            <Header />
            <main className="bg-muted/50 dark:bg-background flex flex-1 flex-col">
              {children}
            </main>
          </TooltipProvider>
        </div>
      </body>
    </html>
  );
}

const getData = async () => {
  const data = {
    description: 'An internet website!',
    icon: '/images/favicon.png',
  };

  return data;
};
