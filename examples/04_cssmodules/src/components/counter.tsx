'use client';

import { useState } from 'react';

import styles from './counter.module.css';

export const Counter = () => {
  const [count, setCount] = useState(0);

  const handleIncrement = () => setCount((c) => c + 1);

  return (
    <section className={styles.section}>
      <div>Count: {count}</div>
      <button onClick={handleIncrement} className={styles.button}>
        Increment
      </button>
    </section>
  );
};
