/**
 * no "use server" detective
 */
import { ClientCounter } from './ClientCounter.js';
import { ServerPing } from './ServerPing/index.js';
import { ServerBox } from './Box.js';

const App = ({ name }: { name: string }) => {
  return (
    <ServerBox>
      <p data-testid="app-name">{name}</p>
      <ClientCounter />
      <ServerPing />
    </ServerBox>
  );
};

export default App;
