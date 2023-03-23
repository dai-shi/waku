import type { MiddlewareCreator } from "./common.js";

// This convension is just one idea.

const rewriteRsc: MiddlewareCreator = (_config, shared) => {
  shared.generatePrefetchCode = (entryItems, moduleIds) => {
    let code = "";
    if (entryItems.length) {
      const rscIds = [...new Set(entryItems.map(([rscId]) => rscId))];
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
          searchParams.set("rsc_id", rscId);
          searchParams.set("props", serializedProps);
          return [`'${serializedProps}': fetch('/?${searchParams}')`];
        })
        .join(",") +
      "}";
    return `  '${rscId}': ${value}`;
  })
  .join(",\n")}
};`;
    }
    moduleIds.forEach((moduleId) => {
      code += `
import('${moduleId}');`;
    });
    return code;
  };

  return async (req, _res, next) => {
    const url = new URL(req.url || "", "http://" + req.headers.host);
    const rscId = url.searchParams.get("rsc_id");
    if (rscId) {
      req.headers["x-react-server-component-id"] = rscId;
      req.headers["x-react-server-component-props"] =
        url.searchParams.get("props") || undefined;
    }
    const rsfId = url.searchParams.get("rsf_id");
    if (rsfId) {
      req.headers["x-react-server-function-id"] = rsfId;
      req.headers["x-react-server-function-name"] =
        url.searchParams.get("name") || "default";
    }
    await next();
  };
};

export default rewriteRsc;
