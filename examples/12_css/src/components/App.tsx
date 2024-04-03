import classNames from 'classnames';
import styles from './App.module.css';
import './App.css';
import { container } from './styles.css';
import { Counter } from './Counter';
import { Banner } from './Banner';
import { ClientBanner } from './ClientBanner';

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku</title>
      <h1 className={classNames('foo', 'bar')}>Hello {name}!!</h1>
      <h1 className={styles.title}>Hello {name}!!</h1>
      <h3 className={container}>This is a server component.</h3>
      <Counter />
      <Banner />
      <ClientBanner />
    </div>
  );
};

export default App;
