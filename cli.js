#!/usr/bin/env -S node --conditions react-server --experimental-loader wakuwork/node-loader --experimental-loader react-server-dom-webpack/node-loader

const cmd = process.argv[2];
import(`./dist/cli-${cmd}.js`);
