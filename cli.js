#!/usr/bin/env npx tsx --conditions react-server

// FIXME: Unfortunately, the user has to install tsx manulally.

const cmd = process.argv[process.argv.length - 1];
import(`./src/${cmd}.ts`);
