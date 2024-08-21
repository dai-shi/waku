'use server';
import { InternalProvider } from './shared.js';
import { jsx } from 'react/jsx-runtime';

async function innerAction({ action }, state, ...args) {
  'use server';
  return action(...args);
}

function wrapAction(action, options) {
  return innerAction.bind(null, { action, options });
}

export function createAI(actions) {
  const wrappedActions = {};
  for (const name in actions) {
    wrappedActions[name] = wrapAction(actions[name]);
  }
  return function AI(props) {
    return jsx(InternalProvider, {
      actions: wrappedActions,
      children: props.children,
    });
  };
}
