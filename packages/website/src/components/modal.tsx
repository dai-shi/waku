'use client';

import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { useClickAway } from '@uidotdev/usehooks';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
};

export const Modal = ({ isOpen, onClose, children }: ModalProps) => {
  const ref: any = useClickAway(onClose);

  if (!isOpen) return <Fragment />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
      <div className="inline-block overflow-clip rounded-2xl border-8 border-gray-950 bg-gray-900 p-2">
        <div
          ref={ref}
          className="relative aspect-[1/1] w-full max-w-4xl overflow-y-auto p-6 text-left text-white sm:aspect-[4/3] lg:aspect-[16/9] lg:p-10"
        >
          {children}
        </div>
      </div>
    </div>
  );
};
