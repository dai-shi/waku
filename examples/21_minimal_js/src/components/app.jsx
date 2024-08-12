import { Suspense } from 'react';

import { Counter } from './counter';

const App = ({ name }) => {
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
          <h3>This is a server component.</h3>
          <Suspense fallback="Pending...">
            <ServerMessage />
          </Suspense>
          <Counter />
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
