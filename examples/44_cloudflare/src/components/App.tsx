import { Suspense } from 'react';
import { getHonoContext } from 'waku/unstable_hono';
import { Counter } from './Counter';

const App = ({ name }: { name: string }) => {
  const c = getHonoContext<{ Bindings: Env }>();
  console.log(
    'Going to run something that can happen after the request is sent...',
  );
  try {
    c.executionCtx?.waitUntil(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          console.log(
            'Waited 5 seconds. The http response should have already been sent',
          );
          resolve();
        }, 5000);
      }),
    );
  } catch (e) {
    console.warn('Unable to invoke the Cloudflare execution context', e);
  }
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body>
        <div
          style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}
        >
          <h1>Hello {name}!!</h1>
          <h3>This is a server component. Max items = {c.env.MAX_ITEMS}</h3>
          <Suspense fallback="Pending...">
            <ServerMessage />
          </Suspense>
          <Counter max={c.env.MAX_ITEMS} />
          <div>{new Date().toISOString()}</div>
        </div>
      </body>
    </html>
  );
};

const ServerMessage = async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return <p>Hello from server!</p>;
};

export default App;
