#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const cmd = process.argv[2];

for (let i = 3; i < process.argv.length; ++i) {
  if (process.argv[i] === "--config") {
    const fname = process.argv[i + 1];
    if (fname && fs.existsSync(fname)) {
      process.env.CONFIG_FILE = fname;
    } else {
      throw new Error("config file does not exist");
    }
    ++i;
  }
}

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
  const { rsc, devServer } = await import("./lib/middleware.js");
  const app = express();
  app.use(rsc({ mode: "development" }));
  app.use(devServer());
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.info("Listening on", port);
  });
}

async function runBuild() {
  const { build } = await import("./lib/builder.js");
  await build();
}

async function runStart() {
  const { default: express } = await import("express");
  const { resolveConfig } = await import("./lib/config.js");
  const config = await resolveConfig("serve");
  const { rsc } = await import("./lib/middleware.js");
  const app = express();
  app.use(rsc({ mode: "production" }));
  app.use(express.static(path.join(config.root, config.framework.outPublic)));
  (express.static.mime as any).default_type = "";
  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.info("Listening on", port);
  });
}
