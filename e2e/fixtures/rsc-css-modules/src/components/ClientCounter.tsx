'use client';
import { useState } from 'react';
import styles from './clientCounter.module.css';

export const ClientCounter = () => {
  const [count, setCount] = useState(0);

  return (
    <div className={styles.counterWrapper} data-testid="client-counter">
      <p data-testid="count">{count}</p>
      <button
        className={styles.counterButton}
        data-testid="increment"
        onClick={() => setCount((c) => c + 1)}
      >
        Increment
      </button>
    </div>
  );
};
