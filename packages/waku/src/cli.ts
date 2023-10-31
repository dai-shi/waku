#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";

import type { Express } from "express";

const require = createRequire(new URL(".", import.meta.url));

const { values, positionals } = parseArgs({
  args: process.argv.splice(2),
  allowPositionals: true,
  options: {
    "with-ssr": {
      type: "boolean",
    },
    version: {
      type: "boolean",
      short: "v",
    },
    help: {
      type: "boolean",
      short: "h",
    },
  },
});

const cmd = positionals[0];

if (values.version) {
  const { version } = require("../package.json");
  console.log(version);
} else if (values.help) {
  displayUsage();
} else {
  switch (cmd) {
    case "dev":
      runDev({ ssr: !!values["with-ssr"] });
      break;
    case "build":
      runBuild({ ssr: !!values["with-ssr"] });
      break;
    case "start":
      runStart({ ssr: !!values["with-ssr"] });
      break;
    default:
      if (cmd) {
        console.error("Unknown command:", cmd);
      }
      displayUsage();
      break;
  }
}

async function runDev(options: { ssr: boolean }) {
  const { default: express } = await import("express");
  const { rsc } = await import("./lib/middleware/rsc.js");
  const app = express();
  app.use(rsc({ command: "dev", ssr: options.ssr }));
  const port = parseInt(process.env.PORT || "3000", 10);
  startServer(app, port);
}

async function runBuild(options: { ssr: boolean }) {
  const { build } = await import("./lib/builder.js");
  await build(options);
}

async function runStart(options: { ssr: boolean }) {
  const { default: express } = await import("express");
  const { resolveConfig } = await import("./lib/config.js");
  const config = await resolveConfig();
  const { rsc } = await import("./lib/middleware/rsc.js");
  const app = express();
  app.use(rsc({ command: "start", ssr: options.ssr }));
  app.use(
    express.static(path.join(config.rootDir, config.distDir, config.publicDir)),
  );
  (express.static.mime as any).default_type = "";
  const port = parseInt(process.env.PORT || "8080", 10);
  startServer(app, port);
}

function startServer(app: Express, port: number) {
  const server = app.listen(port, () => {
    console.log(`ready: Listening on http://localhost:${port}/`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.log(`warn: Port ${port} is in use, trying ${port + 1} instead.`);
      startServer(app, port + 1);
    } else {
      console.error("Failed to start server");
    }
  });
}

function displayUsage() {
  console.log(`
Usage: waku [options] <command>

Commands:
  dev         Start the development server
  build       Build the application for production
  start       Start the production server

Options:
  -c, --config <path>   Path to the configuration file
  --with-ssr            Use opt-in SSR
  -v, --version         Display the version number
  -h, --help            Display this help message
`);
}
