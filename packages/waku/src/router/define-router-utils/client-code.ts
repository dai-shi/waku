import { pathSpecAsString } from '../isomorphic-utils/path-spec.js';
import type { RuntimeConfig } from './config-types.js';

export const getRouterPrefetchCode = (
  path2moduleIds: Record<string, string[]>,
) => {
  const moduleIdSet = new Set<string>();
  Object.values(path2moduleIds).forEach((ids) =>
    ids.forEach((id) => moduleIdSet.add(id)),
  );
  const ids = Array.from(moduleIdSet);
  const path2idxs: Record<string, number[]> = {};
  Object.entries(path2moduleIds).forEach(([path, pathIds]) => {
    path2idxs[path] = pathIds.map((id) => ids.indexOf(id));
  });
  return `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path, callback) => {
  const ids = ${JSON.stringify(ids)};
  const path2idxs = ${JSON.stringify(path2idxs)};
  const key = Object.keys(path2idxs).find((key) => new RegExp(key).test(path));
  for (const idx of path2idxs[key] || []) {
    callback(ids[idx]);
  }
};
`;
};

const buildRoutePath2searchCodecId = (
  configs: readonly RuntimeConfig[],
): Record<string, string> => {
  const routePath2searchCodecId: Record<string, string> = {};
  for (const item of configs) {
    if (item.type === 'route' && item.searchCodec !== undefined) {
      routePath2searchCodecId[pathSpecAsString(item.pathPattern ?? item.path)] =
        item.searchCodec.id;
    }
  }
  return routePath2searchCodecId;
};

// Sets the `route -> search codec id` map on the server's globalThis AND returns
// the browser script that sets it client-side. The server copy is needed because
// a cross-route <Link> serializes its href during SSR, where the injected
// browser script has not run yet.
//
// NOTE: this assumes the `rsc` and `ssr` environments share one process global
// (true for the default single-process runtime). An adapter that runs them in
// separate isolates would not see this server copy during SSR.
export const setupRouterSearchCodecs = (configs: readonly RuntimeConfig[]) => {
  const routePath2searchCodecId = buildRoutePath2searchCodecId(configs);
  if (Object.keys(routePath2searchCodecId).length === 0) {
    return '';
  }
  (
    globalThis as { __WAKU_ROUTER_SEARCH_CODECS__?: Record<string, string> }
  ).__WAKU_ROUTER_SEARCH_CODECS__ = routePath2searchCodecId;
  // escape `<` so the value cannot break out of the inline <script>
  const json = JSON.stringify(routePath2searchCodecId).replace(/</g, '\\u003c');
  return `
globalThis.__WAKU_ROUTER_SEARCH_CODECS__ = ${json};
`;
};
