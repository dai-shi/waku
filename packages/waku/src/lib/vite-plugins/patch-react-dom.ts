import type { Plugin } from 'vite';

// React 19.2 can wait on a stylesheet preload detached by an abandoned render.
// Remove this patch after Waku's minimum React version handles that case.
const SEARCH = '(hoistableRoot = resource.state.preload) &&';
const REPLACE = SEARCH + ' hoistableRoot.isConnected &&';

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
    const patched = code.replace(SEARCH, REPLACE);
    if (patched === code) {
      return;
    }
    return patched;
  },
});
