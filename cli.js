#!/usr/bin/env node

import path from "node:path";
import url from "node:url";
import { Worker } from "node:worker_threads";

const cmd = process.argv[2];
const execArgv = [
  "--conditions",
  "react-server",
  ...(cmd === "dev" ? ["--experimental-loader", "tsx"] : []),
  "--experimental-loader",
  "wakuwork/node-loader",
  "--experimental-loader",
  "react-server-dom-webpack/node-loader",
];
new Worker(
  path.join(
    path.dirname(url.fileURLToPath(import.meta.url)),
    "dist",
    `cli-${cmd}.js`
  ),
  { execArgv }
);
