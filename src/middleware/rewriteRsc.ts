import { Buffer } from "node:buffer";
import { Transform } from "node:stream";

import type { MiddlewareCreator } from "./common.js";

// This convension is just one idea.

// HACK It's not ideal to export a function from middleware.
export const generatePrefetchCode = (
  entryItemsIterable: Iterable<readonly [rscId: string, props: unknown]>,
  moduleIds: Iterable<string>
) => {
  const entryItems = Array.from(entryItemsIterable);
  let code = "";
  if (entryItems.length) {
    const rscIds = [...new Set(entryItems.map(([rscId]) => rscId))];
    code += "if (!globalThis.__WAKUWORK_PREFETCHED__) {";
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
            `'${serializedProps}': fetch('/RSC/${rscId}/${searchParams}')`,
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

// HACK Patching stream is very fragile.
// HACK No reason to have this function in this file
export const transformRsfId = (
  prefixToRemove: string,
  convert = (id: string) => id
) =>
  new Transform({
    transform(chunk, encoding, callback) {
      if (encoding !== ("buffer" as any)) {
        throw new Error("Unknown encoding");
      }
      const data = chunk.toString();
      const lines = data.split("\n");
      let changed = false;
      for (let i = 0; i < lines.length; ++i) {
        const match = lines[i].match(
          new RegExp(`^([0-9]+):{"id":"${prefixToRemove}(.*?)"(.*)$`)
        );
        if (match) {
          lines[i] = `${match[1]}:{"id":"${convert(match[2])}"${match[3]}`;
          changed = true;
        }
      }
      callback(null, changed ? Buffer.from(lines.join("\n")) : chunk);
    },
  });

const rewriteRsc: MiddlewareCreator = (_config, shared) => {
  shared.generatePrefetchCode = generatePrefetchCode;

  return async (req, _res, next) => {
    const url = new URL(req.url || "", "http://" + req.headers.host);
    if (url.pathname.startsWith("/RSC/")) {
      const index = url.pathname.lastIndexOf("/");
      const rscId = url.pathname.slice("/RSC/".length, index);
      const params = new URLSearchParams(url.pathname.slice(index + 1));
      if (rscId && rscId !== "_") {
        req.headers["x-react-server-component-id"] = rscId;
        req.headers["x-react-server-component-props"] =
          params.get("props") || undefined;
      }
      const rsfId = params.get("action_id");
      if (rsfId) {
        req.headers["x-react-server-function-id"] = rsfId;
        req.headers["x-react-server-function-name"] =
          params.get("action_name") || "default";
      }
    }
    await next();
  };
};

export default rewriteRsc;
