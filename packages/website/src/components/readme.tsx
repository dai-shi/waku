'use client';

import { atom, useAtom } from 'jotai';

import { Button } from './button.js';
import { Modal } from './modal.js';

const readmeAtom = atom<boolean>(false);

export const Readme = ({ children }: any) => {
  const [isOpen, setIsOpen] = useAtom(readmeAtom);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Readme</Button>
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        {children}
      </Modal>
    </>
  );
};
