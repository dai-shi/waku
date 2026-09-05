import type { Plugin } from 'vite';

// React 19.2 can wait on a stylesheet preload detached by an abandoned render.
// Remove this patch after Waku's minimum React version handles that case.
const PRELOAD_SEARCH = '(hoistableRoot = resource.state.preload) &&';
const PRELOAD_REPLACE = PRELOAD_SEARCH + ' hoistableRoot.isConnected &&';

// React 19.2 throws away a ping that arrives while the root is rendering, and
// Flight produces exactly that: React's lazy path throws a chunk without
// subscribing to it, so a row that lands while React is yielding leaves the
// chunk in "resolved_model". React unwinds, marks the render as delayed and
// only then attaches its ping listener, which Flight calls synchronously,
// inside the render phase. The transition never re-renders, so a route
// rerendered by a server action silently keeps the old elements. React main
// records the pinged lanes instead of dropping the ping. Remove this patch
// after Waku's minimum React version does the same.
// https://github.com/wakujs/waku/issues/2288
const PING_SEARCH =
  /(\(executionContext & RenderContext\) === NoContext|0 === \(executionContext & 2\))\s*&&\s*(prepareFreshStack\(root, 0\))/;
const PING_REPLACE = '$1 ? $2 : (workInProgressRootPingedLanes |= pingedLanes)';

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
    const patched = code
      .replace(PRELOAD_SEARCH, PRELOAD_REPLACE)
      .replace(PING_SEARCH, PING_REPLACE);
    if (patched === code) {
      return;
    }
    return patched;
  },
});
