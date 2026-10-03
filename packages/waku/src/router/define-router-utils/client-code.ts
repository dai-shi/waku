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
