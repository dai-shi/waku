#!/usr/bin/env -S node --conditions react-server --experimental-loader tsx --experimental-loader ./dist/node-loader.js --experimental-loader react-server-dom-webpack/node-loader

const cmd = process.argv[2];
import(`./dist/cli-${cmd}.js`);
