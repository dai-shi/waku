// @ts-expect-error
import RSDW from 'react-server-dom-webpack/server';

const serverActionsSymbol = Symbol('kServerActions');
const serverActions: Record<string, Function> = {}
if (!(globalThis as any)[serverActionsSymbol]) {
  (globalThis as any)[serverActionsSymbol] = serverActions;
}

/**
 * @internal
 */
export function getServerActions() {
  return serverActions;
}

export function registerServerReference (id: string, fn: Function) {
  serverActions[id] = fn;
  return RSDW.registerServerReference(
    fn,
    id,
  );
}

export function ensureServerEntryExports() {
  // noop
}
