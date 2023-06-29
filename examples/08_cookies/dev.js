import express from "express";
import cookieParser from "cookie-parser";
import { rsc, ssr, devServer } from "waku";

const app = express();
app.use(cookieParser());
app.use(
  rsc({
    mode: "development",
    prehook: (req) => {
      return { count: Number(req.cookies.count) || 0 };
    },
    posthook: (res, ctx) => {
      res.cookie("count", String(ctx.count));
    },
  })
);
app.use(ssr({ mode: "development" }));
app.use(devServer());

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.info("Listening on", port);
});
