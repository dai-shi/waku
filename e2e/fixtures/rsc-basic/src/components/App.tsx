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
    <ServerBox>
      <title>Waku example</title>
      <p data-testid="app-name">{name}</p>
      <ClientCounter />
      <ServerPing />
      <ServerProvider>
        <ClientActionsConsumer />
      </ServerProvider>
    </ServerBox>
  );
};

export default App;
