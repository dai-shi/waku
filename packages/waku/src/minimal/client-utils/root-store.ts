import type { Etags } from '../../lib/utils/etags.js';

type Elements = Record<string | symbol, unknown>;

export type CallServerElementsListener = (elements: Elements) => void;

export type SetElements = (
  updater: (prev: Promise<Elements>) => Promise<Elements>,
) => void;

export type RootStore = {
  setElements: SetElements;
  etags: Etags;
  listeners: Set<CallServerElementsListener>;
};

const mountedRootStores: RootStore[] = [];

export const getDefaultRootStore = (): RootStore | undefined =>
  mountedRootStores.at(-1);

export const clearRootCachedEtags = (): void => {
  mountedRootStores.forEach((store) => {
    store.etags = {};
  });
};

export const registerRootStore = (store: RootStore) => {
  mountedRootStores.push(store);
  return () => {
    const index = mountedRootStores.lastIndexOf(store);
    if (index !== -1) {
      mountedRootStores.splice(index, 1);
    }
  };
};
