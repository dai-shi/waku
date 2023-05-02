#!/usr/bin/env node

import { Worker } from "node:worker_threads";

const cmd = process.argv[2];
const execArgv = [
  "--conditions",
  "react-server",
  "--experimental-loader",
  "tsx",
  "--experimental-loader",
  "wakuwork/node-loader",
  "--experimental-loader",
  "react-server-dom-webpack/node-loader",
];
new Worker(`./src/cli-${cmd}.js`, { execArgv });
