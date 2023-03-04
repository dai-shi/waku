#!/usr/bin/env node --conditions react-server

const cmd = process.argv[2];
import(`./dist/cli-${cmd}.js`);
