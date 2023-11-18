'use client';

import { useState } from 'react';

import { Button } from './button.js';
import { Modal } from './modal.js';

export const Readme = ({ children }: any) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Readme</Button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        {children}
      </Modal>
    </>
  );
};
