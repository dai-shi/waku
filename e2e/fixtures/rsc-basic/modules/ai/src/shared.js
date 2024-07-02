'use client';
import { createContext, useContext } from 'react';
import { jsx } from 'react/jsx-runtime';

const ActionContext = createContext(null);

export function useActions() {
  return useContext(ActionContext);
}

export function InternalProvider(props) {
  return jsx('div', {
    'data-testid': 'ai-internal-provider',
    children: jsx(ActionContext.Provider, {
      value: props.actions,
      children: props.children,
    }),
  });
}
