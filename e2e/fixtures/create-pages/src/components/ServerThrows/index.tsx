import { Counter } from './Counter.js';
import { throws } from '../funcs.js';

export function ServerThrows() {
  return (
    <div data-testid="server-throws">
      <Counter throws={throws} />
    </div>
  );
}
