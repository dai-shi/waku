import styles from './app.module.css';
import { ClientCounter } from './ClientCounter.js';

const App = ({ name }: { name: string }) => {
  return (
    <div data-testid="app-wrapper" className={styles.wrapper}>
      <title>Waku example</title>
      <p className={styles.text} data-testid="app-name">
        {name}
      </p>
      <ClientCounter />
    </div>
  );
};

export default App;
