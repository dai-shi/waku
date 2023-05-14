#!/usr/bin/env node

const cmd = process.argv[2];
process.env.WAKUWORK_CMD = cmd; // TODO TEMP temporary solution
import(`./dist/cli-${cmd}.js`);
