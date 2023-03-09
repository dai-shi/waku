import type { MiddlewareCreator } from "./common.ts";

// This convension is just one idea.

const rewriteRsc: MiddlewareCreator = () => async (req, _res, next) => {
  const url = new URL(req.url || "", "http://" + req.headers.host);
  if (url.pathname.startsWith("/RSC/")) {
    url.pathname = url.pathname.replace(/^\/RSC\//, "/src/") + ".tsx";
    req.url = url.toString();
    req.headers["x-react-server-component-name"] = "default";
  } else if (url.pathname === "/RSF") {
    const id = url.searchParams.get("id");
    if (!id) {
      throw new Error("RSF: id is required");
    }
    url.pathname = id;
    req.url = url.toString();
    req.headers["x-react-server-function-name"] =
      url.searchParams.get("name") || "default";
  }
  await next();
};

export default rewriteRsc;
