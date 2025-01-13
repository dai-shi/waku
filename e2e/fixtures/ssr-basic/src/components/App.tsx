import { Suspense } from 'react';
import { preload } from 'react-dom';

import { Counter } from './Counter.js';
import { AIProvider } from '../ai/index.js';
import { AIClient } from './AIClient.js';

const DelayedBackground = async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return <link href="background.css" rel="stylesheet" />;
};

const App = ({ name }: { name: string }) => {
  preload('background.css', { as: 'style' });
  return (
    <html>
      <head>
        <title>Waku example</title>
      </head>
      <body>
        <div
          style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}
        >
          <h1 data-testid="app-name">{name}</h1>
          <Counter />
          <section data-testid="vercel-ai">
            <AIProvider>
              <AIClient />
            </AIProvider>
          </section>
          <Suspense fallback="Loading...">
            <DelayedBackground />
          </Suspense>
        </div>
      </body>
    </html>
  );
};

export default App;
