import { Counter } from './Counter.js';
import { AIProvider } from '../ai/index.js';
import { AIClient } from './AIClient.js';

const App = ({ name }: { name: string }) => {
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
        </div>
      </body>
    </html>
  );
};

export default App;
