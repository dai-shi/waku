#!/usr/bin/env node

const cmd = process.argv[2];

switch (cmd) {
  case "dev":
    runDev();
    break;
  case "build":
    runBuild();
    break;
  case "start":
    runStart();
    break;
  default:
    throw Error("unknown cmd: " + cmd);
}

async function runDev() {
  const { default: express } = await import("express");
  const { rsc } = await import("./middleware.js");
  const app = express();
  app.use(rsc({ mode: "development" }));
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.info("Listening on", port);
  });
}

async function runBuild() {
  const { build } = await import("./builder.js");
  build();
}

async function runStart() {
  // TODO
}
