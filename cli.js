#!/usr/bin/env node

const cmd = process.argv[2];
import(`./dist/cli-${cmd}.js`);
