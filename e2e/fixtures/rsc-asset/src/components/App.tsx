import fs from 'node:fs';
import testClientTxtUrl from './test-client.txt?no-inline';

const App = (_: { name: string }) => {
  // vite doesn't handle `new URL` for ssr,
  // so this is handled by a custom plugin in waku.config.ts
  const testServerTxtUrl = new URL('./test-server.txt', import.meta.url);

  return (
    <html>
      <head>
        <title>e2e-rsc-asset</title>
      </head>
      <body>
        <main>
          <div>
            client asset:{' '}
            <a href={testClientTxtUrl} data-testid="client-link">
              {testClientTxtUrl}
            </a>
          </div>
          <div data-testid="server-file">
            server asset: {fs.readFileSync(testServerTxtUrl, 'utf-8')}
          </div>
        </main>
      </body>
    </html>
  );
};

export default App;
