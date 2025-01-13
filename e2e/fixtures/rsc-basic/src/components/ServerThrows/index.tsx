import { ServerBox } from '../Box.js';
import { Counter } from './Counter.js';
import { throws } from './actions.js';

export function ServerThrows() {
  return (
    <ServerBox data-testid="server-throws">
      <Counter throws={throws} />
    </ServerBox>
  );
}
