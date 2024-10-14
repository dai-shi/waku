import { runtime } from 'my-module';
import { Client } from './Client.js';

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
          <div data-testid="server-runtime">{runtime}</div>
          <Client />
        </div>
      </body>
    </html>
  );
};

export default App;
