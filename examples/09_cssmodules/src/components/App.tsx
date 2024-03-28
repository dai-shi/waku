import { getEnv } from 'waku/server';

// @ts-expect-error no types
import styles from './App.module.css';
import { Counter } from './Counter';

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku</title>
      <h1 className={styles.title}>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Counter />
      Env: {import.meta.env.WAKU_PUBLIC_HELLO} ({getEnv('GREETING')})
    </div>
  );
};

export default App;
