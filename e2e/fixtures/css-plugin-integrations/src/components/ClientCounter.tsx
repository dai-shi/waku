'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { vanillaClientStyle } from '../styles.css';

const styles = stylex.create({
  client: {
    borderColor: 'orange',
    borderStyle: 'solid',
    borderWidth: '1px',
    padding: '8px',
  },
});

export function ClientCounter() {
  const [count, setCount] = useState(0);
  return (
    <button
      className={vanillaClientStyle}
      {...stylex.props(styles.client)}
      data-testid="client-counter"
      onClick={() => setCount((c) => c + 1)}
    >
      Client count: {count}
    </button>
  );
}
