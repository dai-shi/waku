/**
 * no "use server" detective
 */
import { ClientCounter } from './ClientCounter.js';
import { ServerPing } from './ServerPing/index.js';
import { ServerBox } from './Box.js';
import { ServerProvider } from './ServerAction/Server.js';
import { ClientActionsConsumer } from './ServerAction/Client.js';

const App = ({ name }: { name: string }) => {
  return (
    <html>
      <head>
        <title>Waku example</title>
      </head>
      <body>
        <ServerBox>
          <p data-testid="app-name">{name}</p>
          <>
            {/* FIXME: Why we need this fragment? A React bug? */}
            <ClientCounter />
            <ServerPing />
          </>
          <ServerProvider>
            <ClientActionsConsumer />
          </ServerProvider>
        </ServerBox>
      </body>
    </html>
  );
};

export default App;
