'use client';

// eslint-disable-next-line import/no-unresolved
import { createElement, useContext, useEffect, useState } from 'react';

import { Context } from './context-provider';

export const ContextConsumer = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const value = useContext(Context);
  return createElement(
    'div',
    null,
    mounted &&
      createElement(
        'div',
        { 'data-testid': 'context-consumer-mounted' },
        'true',
      ),
    createElement('div', { 'data-testid': 'context-consumer-value' }, value),
  );
};
