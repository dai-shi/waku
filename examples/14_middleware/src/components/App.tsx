import { Counter } from './Counter.js';

const App = ({
  name,
  count
}: {
  name: string;
  count: number
}) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku</title>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <p>Cookie count: {count}</p>
      <Counter />
    </div>
  );
};

export default App;
