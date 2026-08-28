import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_registerRscReloadListener as registerRscReloadListener,
} from 'waku/minimal/client';

registerRscReloadListener(() => {
  (
    globalThis as typeof globalThis & {
      __WAKU_ROOTLESS_HMR_LISTENER__?: boolean;
    }
  ).__WAKU_ROOTLESS_HMR_LISTENER__ = true;
});

registerRscReloadListener(() => {}, { replace: true });
(
  globalThis as typeof globalThis & {
    __WAKU_ROOTLESS_HMR_REPLACEMENT_REGISTERED__?: boolean;
  }
).__WAKU_ROOTLESS_HMR_REPLACEMENT_REGISTERED__ = true;

const multipleRoots = new URLSearchParams(window.location.search).has(
  'multiple-roots',
);

const rootElement = (
  <StrictMode>
    <Root>
      <Slot id="App" />
    </Root>
  </StrictMode>
);

if (multipleRoots) {
  type RootName = 'first' | 'second' | 'third';
  const mounted = new Set<RootName>();
  const mountRoot = (name: RootName) => {
    if (mounted.has(name)) {
      return;
    }
    mounted.add(name);
    const container = document.createElement('div');
    container.dataset.testid = `${name}-root`;
    document.body.appendChild(container);
    const reactRoot = createRoot(container, defaultRootOptions);
    let initialRscParams: unknown;
    const renderRoot = () => {
      reactRoot.render(
        <StrictMode>
          <Root initialRscPath={name} initialRscParams={initialRscParams}>
            <Slot id="Content" />
          </Root>
        </StrictMode>,
      );
    };
    renderRoot();
    if (name !== 'first') {
      const unmount = document.createElement('button');
      unmount.dataset.testid = `unmount-${name}-root`;
      unmount.textContent = `Unmount ${name} root`;
      unmount.addEventListener('click', () => reactRoot.unmount());
      document.body.appendChild(unmount);
    }
    if (name === 'second') {
      const rerender = document.createElement('button');
      rerender.dataset.testid = 'rerender-second-root';
      rerender.textContent = 'Rerender second root';
      rerender.addEventListener('click', () => {
        initialRscParams = {};
        renderRoot();
      });
      document.body.appendChild(rerender);
    }
  };
  const global = globalThis as typeof globalThis & {
    __WAKU_MOUNT_ROOT__?: (name: RootName) => void;
  };
  global.__WAKU_MOUNT_ROOT__ = mountRoot;
  mountRoot('first');
  if (new URLSearchParams(window.location.search).has('simultaneous-roots')) {
    mountRoot('second');
  }
} else {
  createRoot(document, defaultRootOptions).render(rootElement);
}
