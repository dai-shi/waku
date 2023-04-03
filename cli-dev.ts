#!/usr/bin/env -S node --conditions react-server --experimental-loader tsx --experimental-loader ./node-loader.js --experimental-loader react-server-dom-webpack/node-loader

const cmd = process.argv[2];
import(`./src/cli-${cmd}.js`);
