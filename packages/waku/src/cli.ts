import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import * as swc from '@swc/core';

import type { Config } from './config.js';
import { resolveConfig } from './lib/config.js';
import { honoMiddleware as honoDevMiddleware } from './lib/middleware/hono-dev.js';
import { honoMiddleware as honoPrdMiddleware } from './lib/middleware/hono-prd.js';
import { build } from './lib/builder/build.js';

const require = createRequire(new URL('.', import.meta.url));

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    'with-ssr': {
      type: 'boolean',
    },
    'with-vercel': {
      type: 'boolean',
    },
    'with-vercel-static': {
      type: 'boolean',
    },
    'with-cloudflare': {
      type: 'boolean',
    },
    'with-deno': {
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

loadEnv();
const config = await loadConfig();

const cmd = positionals[0];

if (values.version) {
  const { version } = require('../package.json');
  console.log(version);
} else if (values.help) {
  displayUsage();
} else {
  const ssr = !!values['with-ssr'];
  switch (cmd) {
    case 'dev':
      runDev({ ssr });
      break;
    case 'build':
      runBuild({
        ssr,
      });
      break;
    case 'start':
      runStart({ ssr });
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
  app.use(
    '*',
    honoDevMiddleware({ ...options, config, env: process.env as any }),
  );
  const port = parseInt(process.env.PORT || '3000', 10);
  startServer(app, port);
}

async function runBuild(options: { ssr: boolean }) {
  await build({
    ...options,
    config,
    env: process.env as any,
    deploy:
      (values['with-vercel'] ?? !!process.env.VERCEL
        ? values['with-vercel-static']
          ? 'vercel-static'
          : 'vercel-serverless'
        : undefined) ||
      (values['with-cloudflare'] ? 'cloudflare' : undefined) ||
      (values['with-deno'] ? 'deno' : undefined),
  });
}

async function runStart(options: { ssr: boolean }) {
  const { distDir, publicDir, entriesJs } = await resolveConfig(config);
  const loadEntries = () =>
    import(pathToFileURL(path.resolve(distDir, entriesJs)).toString());
  const app = new Hono();
  app.use('*', serveStatic({ root: path.join(distDir, publicDir) }));
  app.use(
    '*',
    honoPrdMiddleware({
      ...options,
      config,
      loadEntries,
      env: process.env as any,
    }),
  );
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
      console.error(`Failed to start server: ${err.message}`);
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
  --with-vercel         Output for Vercel on build
  --with-cloudflare     Output for Cloudflare on build
  --with-deno           Output for Deno on build
  -v, --version         Display the version number
  -h, --help            Display this help message
`);
}

// TODO consider using a library such as `dotenv`
function loadEnv() {
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const [key, value] = line.split('=');
      if (key && value) {
        if (value.startsWith('"') && value.endsWith('"')) {
          process.env[key.trim()] = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          process.env[key.trim()] = value.slice(1, -1);
        } else {
          process.env[key.trim()] = value.trim();
        }
      }
    }
  }
}

// TODO is this a good idea?
async function loadConfig(): Promise<Config> {
  if (!existsSync('waku.config.ts')) {
    return {};
  }
  const { code } = swc.transformFileSync('waku.config.ts', {
    swcrc: false,
    jsc: {
      parser: { syntax: 'typescript' },
      target: 'es2022',
    },
  });
  const temp = path.resolve(`.temp-${randomBytes(8).toString('hex')}.js`);
  try {
    writeFileSync(temp, code);
    return (await import(pathToFileURL(temp).toString())).default;
  } finally {
    unlinkSync(temp);
  }
}
