import { Counter } from '@/components/Counter.js';
import { MyFragment } from '@/components/MyFragment.js';

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku</title>
      <MyFragment>
        <h1>Hello {name}!!</h1>
      </MyFragment>
      <h3>This is a server component.</h3>
      <Counter />
      <div>{new Date().toISOString()}</div>
    </div>
  );
};

export default App;
