import { clearInitialRscEntries } from './initial-rsc-store.js';
import { clearRootCachedEtags, getDefaultRootStore } from './root-store.js';
import type { RootStore } from './root-store.js';

type Unregister = () => void;

export type RegisterRscReloadListener = (
  listener: () => void,
  options?: { replace?: boolean },
) => Unregister;

type RootReload = {
  fallback?: () => void;
  replacement?: () => void;
  mounted: boolean;
};

const rootReloads = new WeakMap<RootStore, RootReload>();
let rootlessReplacement: (() => void) | undefined;

const replaceRscReloadListener = (
  previous: (() => void) | undefined,
  listener: (() => void) | undefined,
) => {
  const listeners = (globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= []);
  const index = previous ? listeners.indexOf(previous) : -1;
  if (listener) {
    if (index === -1) {
      listeners.push(listener);
    } else {
      listeners.splice(index, 1, listener);
    }
  } else if (index !== -1) {
    listeners.splice(index, 1);
  }
};

const activateDefaultRscReloadListener = (): void => {
  const store = getDefaultRootStore();
  if (!store) {
    globalThis.__WAKU_REFETCH_RSC__ = rootlessReplacement;
    return;
  }
  const reload = rootReloads.get(store);
  globalThis.__WAKU_REFETCH_RSC__ = reload?.replacement ?? reload?.fallback;
};

const createRscReloadListener =
  (listener: () => void): Unregister =>
  () => {
    clearRootCachedEtags();
    clearInitialRscEntries();
    listener();
  };

const addRscReloadListener = (listener: () => void): Unregister => {
  const listeners = (globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= []);
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
};

export const registerRootRscReloadListener = (
  store: RootStore,
  listener: () => void,
  options?: { replace?: boolean },
): Unregister => {
  if (!options?.replace) {
    return addRscReloadListener(listener);
  }

  const rootReload = rootReloads.get(store) ?? { mounted: false };
  rootReloads.set(store, rootReload);
  const registered = createRscReloadListener(listener);
  const previous = rootReload.replacement ?? rootReload.fallback;
  rootReload.replacement = registered;
  replaceRscReloadListener(previous, registered);
  if (getDefaultRootStore() === store) {
    globalThis.__WAKU_REFETCH_RSC__ = registered;
  }
  return () => {
    if (rootReload.replacement === registered) {
      delete rootReload.replacement;
      replaceRscReloadListener(
        registered,
        rootReload.mounted ? rootReload.fallback : undefined,
      );
      if (!rootReload.mounted) {
        rootReloads.delete(store);
      }
      activateDefaultRscReloadListener();
    }
  };
};

export const registerRootReload = (
  store: RootStore,
  fallback: () => void,
): Unregister => {
  const rootReload = rootReloads.get(store) ?? { mounted: false };
  const registered = createRscReloadListener(fallback);
  rootReload.fallback = registered;
  rootReload.mounted = true;
  rootReloads.set(store, rootReload);
  if (rootlessReplacement) {
    replaceRscReloadListener(rootlessReplacement, undefined);
    rootlessReplacement = undefined;
  }
  const current = rootReload.replacement ?? registered;
  const listeners = (globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= []);
  if (!listeners.includes(current)) {
    listeners.push(current);
  }
  activateDefaultRscReloadListener();
  return () => {
    const current = rootReload.replacement ?? rootReload.fallback;
    replaceRscReloadListener(current, undefined);
    rootReload.mounted = false;
    delete rootReload.fallback;
    if (!rootReload.replacement) {
      rootReloads.delete(store);
    }
    activateDefaultRscReloadListener();
  };
};

export const registerDefaultRscReloadListener: RegisterRscReloadListener = (
  listener,
  options,
) => {
  if (!import.meta.hot) {
    return () => {};
  }
  if (!options?.replace) {
    return addRscReloadListener(listener);
  }
  const store = getDefaultRootStore();
  if (!store) {
    const registered = createRscReloadListener(listener);
    replaceRscReloadListener(rootlessReplacement, registered);
    rootlessReplacement = registered;
    globalThis.__WAKU_REFETCH_RSC__ = registered;
    return () => {
      if (rootlessReplacement === registered) {
        replaceRscReloadListener(registered, undefined);
        rootlessReplacement = undefined;
        activateDefaultRscReloadListener();
      }
    };
  }
  return registerRootRscReloadListener(store, listener, options);
};
