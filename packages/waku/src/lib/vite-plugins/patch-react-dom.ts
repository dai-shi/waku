import type { Plugin } from 'vite';

// React 19.3 can wait on a stylesheet preload detached by an abandoned render.
// Remove this patch after Waku's minimum React version handles that case.
// https://github.com/wakujs/waku/issues/2281
const PRELOAD_SEARCH = '(hoistableRoot = resource.state.preload) &&';
const PRELOAD_REPLACE = PRELOAD_SEARCH + ' hoistableRoot.isConnected &&';

const isReactDomClient = (id: string) =>
  /[/\\](?:react-dom-client\.(?:development|production)|react-dom_client)\.js$/.test(
    id.split('?')[0]!,
  );

export const patchReactDomPlugin = (): Plugin => ({
  name: 'waku:vite-plugins:patch-react-dom',
  enforce: 'pre',
  transform(code, id) {
    if (!isReactDomClient(id)) {
      return;
    }
    const patched = code.replace(PRELOAD_SEARCH, PRELOAD_REPLACE);
    if (patched === code) {
      return;
    }
    return patched;
  },
});
