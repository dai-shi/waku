#!/usr/bin/env node

import path from 'node:path';
import url from 'node:url';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import { resolveConfig } from './lib/config.js';
import { honoMiddleware as honoDevMiddleware } from './lib/middleware/hono-dev.js';
import { honoMiddleware as honoPrdMiddleware } from './lib/middleware/hono-prd.js';
import { build } from './lib/builder/build.js';

const require = createRequire(new URL('.', import.meta.url));

const { values, positionals } = parseArgs({
  args: process.argv.splice(2),
  allowPositionals: true,
  options: {
    'with-ssr': {
      type: 'boolean',
    },
    version: {
      type: 'boolean',
      short: 'v',
    },
    help: {
      type: 'boolean',
      short: 'h',
    },
  },
});

const cmd = positionals[0];

if (values.version) {
  const { version } = require('../package.json');
  console.log(version);
} else if (values.help) {
  displayUsage();
} else {
  switch (cmd) {
    case 'dev':
      runDev({ ssr: !!values['with-ssr'] });
      break;
    case 'build':
      runBuild({ ssr: !!values['with-ssr'] });
      break;
    case 'start':
      runStart({ ssr: !!values['with-ssr'] });
      break;
    default:
      if (cmd) {
        console.error('Unknown command:', cmd);
      }
      displayUsage();
      break;
  }
}

async function runDev(options: { ssr: boolean }) {
  const app = new Hono();
  app.use('*', honoDevMiddleware({ ssr: options.ssr }));
  const port = parseInt(process.env.PORT || '3000', 10);
  startServer(app, port);
}

async function runBuild(options: { ssr: boolean }) {
  await build({ ssr: options.ssr });
}

async function runStart(options: { ssr: boolean }) {
  const { distDir, publicDir, entriesJs } = await resolveConfig({});
  const entries = import(
    url.pathToFileURL(path.resolve(distDir, entriesJs)).toString()
  );
  const app = new Hono();
  app.use('*', honoPrdMiddleware({ entries, ssr: options.ssr }));
  app.use('*', serveStatic({ root: path.join(distDir, publicDir) }));
  const port = parseInt(process.env.PORT || '8080', 10);
  startServer(app, port);
}

async function startServer(app: Hono, port: number) {
  const server = serve({ ...app, port }, () => {
    console.log(`ready: Listening on http://localhost:${port}/`);
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`warn: Port ${port} is in use, trying ${port + 1} instead.`);
      startServer(app, port + 1);
    } else {
      console.error('Failed to start server');
    }
  });
}

function displayUsage() {
  console.log(`
Usage: waku [options] <command>

Commands:
  dev         Start the development server
  build       Build the application for production
  start       Start the production server

Options:
  --with-ssr            Use opt-in SSR
  -v, --version         Display the version number
  -h, --help            Display this help message
`);
}
