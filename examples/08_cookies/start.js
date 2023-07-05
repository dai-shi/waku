import url from "node:url";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import {
  rsc,
  // ssr,
} from "waku";

const root = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "dist"
);
process.env.CONFIG_FILE = "vite.prd.config.ts";

const app = express();
app.use(cookieParser());
app.use(
  rsc({
    command: "start",
    unstable_prehook: (req) => {
      return { count: Number(req.cookies.count) || 0 };
    },
    unstable_posthook: (req, res, ctx) => {
      res.cookie("count", String(ctx.count));
    },
  })
);
// Passing cookies through SSR server isn't supported (yet).
// app.use(ssr({ command: "start" }));
app.use(express.static(path.join(root, "public")));
express.static.mime.default_type = "";

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.info("Listening on", port);
});
