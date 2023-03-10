import type { MiddlewareCreator } from "./common.ts";

// This convension is just one idea.

const rewriteRsc: MiddlewareCreator = () => async (req, _res, next) => {
  const url = new URL(req.url || "", "http://" + req.headers.host);
  {
    const id = url.searchParams.get("rsc_id");
    if (id) {
      req.headers["x-react-server-component-id"] = id;
    }
  }
  {
    const id = url.searchParams.get("rsf_id");
    if (id) {
      req.headers["x-react-server-function-id"] = id;
      req.headers["x-react-server-function-name"] =
        url.searchParams.get("name") || "default";
    }
  }
  await next();
};

export default rewriteRsc;
