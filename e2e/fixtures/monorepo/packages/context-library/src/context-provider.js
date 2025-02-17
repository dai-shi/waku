'use client';

// eslint-disable-next-line import/no-unresolved
import { createContext, createElement } from 'react';

export const Context = createContext('original');

export const ContextProvider = ({ children }) => {
  return createElement(Context.Provider, { value: 'provider value' }, children);
};
