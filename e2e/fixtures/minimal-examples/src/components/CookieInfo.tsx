import { getCookieCount, getItemCount } from '../waku.server';
import { Counter } from './Counter';

export function CookieInfo() {
  return (
    <section>
      <p data-testid="cookie-count">Cookie count: {getCookieCount()}</p>
      <p data-testid="item-count">Item count: {getItemCount()}</p>
      <Counter />
    </section>
  );
}
