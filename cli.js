#!/usr/bin/env node

import { Worker } from "node:worker_threads";

const cmd = process.argv[2];
process.env.WAKUWORK_CMD = cmd;
const execArgv = [
  ...(cmd === "dev" ? ["--experimental-loader", "tsx"] : []),
  "--experimental-loader",
  "wakuwork/node-loader",
  "--experimental-loader",
  "react-server-dom-webpack/node-loader",
];
new Worker(new URL(`dist/cli-${cmd}.js`, import.meta.url), { execArgv });
