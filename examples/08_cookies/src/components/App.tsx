import { getContext } from 'waku/server';
import { Counter } from './Counter.js';

const App = ({ name, items }: { name: string; items: unknown[] }) => {
  const ctx = getContext<{ count: number }>();
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <p>Cookie count: {ctx.count}</p>
      <Counter />
      <p>Item count: {items.length}</p>
    </div>
  );
};

export default App;
