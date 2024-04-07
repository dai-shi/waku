'use strict';
'use client';

import { useEffect } from 'react';
import { create, props } from '@stylexjs/stylex';
// eslint-disable-next-line import/no-unresolved
import '@stylex-dev.css';

const styles = create({
  root: {
    backgroundColor: '#444',
    color: '#fff',
    padding: '10px',
    textAlign: 'center',
  },
});

export const ClientBanner = () => {
  useEffect(() => {
    console.log('ClientBanner rendered!');
  });
  return (
    <div {...props(styles.root)}>This is a client banner by StyleX CSS</div>
  );
};
