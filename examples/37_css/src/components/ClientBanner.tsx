'use client';

import { useEffect } from 'react';
import { create, props } from '@stylexjs/stylex';

const styles = create({
  root: {
    backgroundColor: '#444',
    color: '#000',
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
