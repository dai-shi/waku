import { Counter } from './Counter.js';

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <h1 data-testid="app-name">{name}</h1>
      <Counter />
    </div>
  );
};

export default App;
