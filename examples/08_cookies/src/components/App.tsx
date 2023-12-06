import { Counter } from './Counter.js';

const App = ({
  name,
  count,
  items,
}: {
  name: string;
  count: number;
  items: unknown[];
}) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <p>Cookie count: {count}</p>
      <Counter />
      <p>Item count: {items.length}</p>
    </div>
  );
};

export default App;
