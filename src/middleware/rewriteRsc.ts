import type { MiddlewareCreator } from "./common.js";

// This convension is just one idea.

export const generatePrefetchCode = (
  entryItemsIterable: Iterable<readonly [rscId: string, props: unknown]>,
  moduleIds: Iterable<string>
) => {
  const entryItems = Array.from(entryItemsIterable);
  let code = "";
  if (entryItems.length) {
    const rscIds = [...new Set(entryItems.map(([rscId]) => rscId))];
    code += "if (!globalThis.__WAKUWORK_PREFETCHED) {";
    code += `
globalThis.__WAKUWORK_PREFETCHED__ = {
${rscIds
  .map((rscId) => {
    const value =
      "{" +
      entryItems
        .flatMap(([id, props]) => {
          if (id !== rscId) return [];
          // FIXME we blindly expect JSON.stringify usage is deterministic
          const serializedProps = JSON.stringify(props);
          const searchParams = new URLSearchParams();
          searchParams.set("props", serializedProps);
          return [
            `'${serializedProps}': fetch('/RSC/${rscId}?${searchParams}')`,
          ];
        })
        .join(",") +
      "}";
    return `  '${rscId}': ${value}`;
  })
  .join(",\n")}
};`;
  }
  for (const moduleId of moduleIds) {
    code += `
import('${moduleId}');`;
  }
  code += "}";
  return code;
};

const rewriteRsc: MiddlewareCreator = (_config, shared) => {
  shared.generatePrefetchCode = generatePrefetchCode;

  return async (req, _res, next) => {
    const url = new URL(req.url || "", "http://" + req.headers.host);
    if (url.pathname.startsWith("/RSC/")) {
      const rscId = url.pathname.slice("/RSC/".length);
      if (rscId) {
        req.headers["x-react-server-component-id"] = rscId;
        req.headers["x-react-server-component-props"] =
          url.searchParams.get("props") || undefined;
      }
      const rsfId = url.searchParams.get("action_id");
      if (rsfId) {
        req.headers["x-react-server-function-id"] = rsfId;
        req.headers["x-react-server-function-name"] =
          url.searchParams.get("action_name") || "default";
      }
    }
    await next();
  };
};

export default rewriteRsc;
