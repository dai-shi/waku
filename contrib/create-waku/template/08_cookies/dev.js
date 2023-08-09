import express from "express";
import cookieParser from "cookie-parser";
import {
  rsc,
  //ssr,
  devServer,
} from "waku";

const app = express();
app.use(cookieParser());
app.use(
  rsc({
    command: "dev",
    unstable_prehook: (req) => {
      return { count: Number(req.cookies.count) || 0 };
    },
    unstable_posthook: (req, res, ctx) => {
      res.cookie("count", String(ctx.count));
    },
  }),
);
// Passing cookies through SSR server isn't supported (yet).
// app.use(ssr({ command: "dev" }));
app.use(devServer());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.info("Listening on", port);
});
