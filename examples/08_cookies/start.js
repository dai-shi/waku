import url from "node:url";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";

const root = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "dist"
);
process.env.CONFIG_FILE = "vite.prd.config.ts";

const { rsc, ssr } = await import("waku");

const app = express();
app.use(cookieParser());
app.use(
  rsc({
    mode: "production",
    prehook: (req) => {
      return { count: Number(req.cookies.count) || 0 };
    },
    posthook: (res, ctx) => {
      res.cookie("count", String(ctx.count));
    },
  })
);
app.use(ssr({ mode: "production" }));
app.use(express.static(path.join(root, "public")));
express.static.mime.default_type = "";

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.info("Listening on", port);
});
