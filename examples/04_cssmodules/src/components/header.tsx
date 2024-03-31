import { Link } from 'waku';

import styles from './header.module.css';

export const Header = () => {
  return (
    <header className={styles.header}>
      <h2 className={styles.h2}>
        <Link to="/">Waku starter</Link>
      </h2>
    </header>
  );
};
