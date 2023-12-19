// @ts-expect-error no types
import styles from './App.module.css';
import './App.css';
import { container } from './styles.css.js';
import { Counter } from './Counter.js';

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku example</title>
      <h1>Hello {name}!!</h1>
      <h1 className={styles.title}>Hello {name}!!</h1>
      <h3 className={container}>This is a server component.</h3>
      <Counter />
    </div>
  );
};

export default App;
