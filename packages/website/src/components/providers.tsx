'use client';

import type { ReactNode } from 'react';
import { createStore, Provider } from 'jotai';

import { menuAtom, scrolledAtom } from '../atoms/index.js';

type ProvidersProps = { children: ReactNode };

const store = createStore();
store.set(menuAtom, false);
store.set(scrolledAtom, false);

export const Providers = ({ children }: ProvidersProps) => {
  return <Provider store={store}>{children}</Provider>;
};
