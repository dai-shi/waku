import styles from './app.module.css';
import { ClientCounter } from './ClientCounter.js';

const App = ({ name }: { name: string }) => {
  return (
    <html>
      <head>
        <title>Waku example</title>
      </head>
      <body>
        <div data-testid="app-wrapper" className={styles.wrapper}>
          <p className={styles.text} data-testid="app-name">
            {name}
          </p>
          <ClientCounter />
        </div>
      </body>
    </html>
  );
};

export default App;
