'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

export const ShowHide = ({ children }: { children: ReactNode }) => {
  const [show, setShow] = useState(false);
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        padding: '24px',
        zIndex: 20,
      }}
    >
      {show ? (
        <>
          {children}
          <button type="button" onClick={() => setShow(false)}>
            Hide
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setShow(true)}>
          Show
        </button>
      )}
    </div>
  );
};
