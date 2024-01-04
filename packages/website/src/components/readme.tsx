'use client';

import { useState, Fragment } from 'react';
import type { ReactNode } from 'react';

import { Button } from './button.js';
import { Modal } from './modal.js';

type ReadmeProps = {
  readme: ReactNode;
};

export const Readme = ({ readme }: ReadmeProps) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <Fragment>
      <Button onClick={() => setIsOpen(true)}>Readme</Button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        {readme}
      </Modal>
    </Fragment>
  );
};
