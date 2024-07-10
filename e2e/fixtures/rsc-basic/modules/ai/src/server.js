'use server';
import { InternalProvider } from './shared.js';
import { jsx } from 'react/jsx-runtime';

async function innerAction({ action }, state, ...args) {
  'use server';
  const result = await action(...args);
  // eslint-disable-next-line no-undef
  console.log('wrapped action', result);
  return result;
}

function wrapAction(action, options) {
  return innerAction.bind(null, { action, options });
}

export function createAI(actions) {
  const wrappedActions = {};
  for (const name in actions) {
    console.log('action', name, actions, actions[name]);
    wrappedActions[name] = wrapAction(actions[name]);
  }
  return function AI(props) {
    return jsx(InternalProvider, {
      actions: wrappedActions,
      children: props.children,
    });
  };
}
