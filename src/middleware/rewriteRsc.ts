import type { MiddlewareCreator } from "./lib/common.js";

// This convension is just one idea.

const rewriteRsc: MiddlewareCreator = () => {
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
