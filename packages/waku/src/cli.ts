import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import * as dotenv from 'dotenv';

import type { Config } from './config.js';
import { serverEngine } from './lib/hono/engine.js';
import { build } from './lib/builder/build.js';
import { DIST_ENTRIES_JS, DIST_PUBLIC } from './lib/builder/constants.js';

const require = createRequire(new URL('.', import.meta.url));

dotenv.config({ path: ['.env.local', '.env'] });

const CONFIG_FILE = 'waku.config.ts'; // XXX only ts extension

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    'with-vercel': {
      type: 'boolean',
    },
    'with-vercel-static': {
      type: 'boolean',
    },
    'with-netlify': {
      type: 'boolean',
    },
    'with-netlify-static': {
      type: 'boolean',
    },
    'with-cloudflare': {
      type: 'boolean',
    },
    'with-partykit': {
      type: 'boolean',
    },
    'with-deno': {
      type: 'boolean',
    },
    'with-aws-lambda': {
      type: 'boolean',
    },
    'experimental-partial': {
      type: 'boolean',
    },
    'experimental-compress': {
      type: 'boolean',
    },
    port: {
      type: 'string',
      short: 'p',
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
      await runDev();
      break;
    case 'build':
      await runBuild();
      break;
    case 'start':
      await runStart();
      break;
    default:
      if (cmd) {
        console.error('Unknown command:', cmd);
      }
      displayUsage();
      break;
  }
}

async function runDev() {
  const config = await loadConfig();
  const honoEnhancer =
    config.unstable_honoEnhancer || ((createApp) => createApp);
  const createApp = (app: Hono) => {
    if (values['experimental-compress']) {
      app.use(compress());
    }
    app.use(
      serverEngine({
        cmd: 'dev',
        config,
        env: process.env as any,
        unstable_onError: new Set(),
      }),
    );
    app.notFound((c) => {
      // FIXME can we avoid hardcoding the public path?
      const file = path.join('public', '404.html');
      if (existsSync(file)) {
        return c.html(readFileSync(file, 'utf8'), 404);
      }
      return c.text('404 Not Found', 404);
    });
    return app;
  };
  const port = parseInt(values.port || '3000', 10);
  await startServer(honoEnhancer(createApp)(new Hono()), port);
}

async function runBuild() {
  const config = await loadConfig();
  process.env.NODE_ENV = 'production';
  await build({
    config,
    env: process.env as any,
    partial: !!values['experimental-partial'],
    deploy:
      ((values['with-vercel'] ?? !!process.env.VERCEL)
        ? values['with-vercel-static']
          ? 'vercel-static'
          : 'vercel-serverless'
        : undefined) ||
      ((values['with-netlify'] ?? !!process.env.NETLIFY)
        ? values['with-netlify-static']
          ? 'netlify-static'
          : 'netlify-functions'
        : undefined) ||
      (values['with-cloudflare'] ? 'cloudflare' : undefined) ||
      (values['with-partykit'] ? 'partykit' : undefined) ||
      (values['with-deno'] ? 'deno' : undefined) ||
      (values['with-aws-lambda'] ? 'aws-lambda' : undefined),
  });
}

async function runStart() {
  const config = await loadConfig();
  const { distDir = 'dist' } = config;
  const honoEnhancer =
    config.unstable_honoEnhancer || ((createApp) => createApp);
  const loadEntries = () =>
    import(pathToFileURL(path.resolve(distDir, DIST_ENTRIES_JS)).toString());
  const createApp = (app: Hono) => {
    if (values['experimental-compress']) {
      app.use(compress());
    }
    app.use(serveStatic({ root: path.join(distDir, DIST_PUBLIC) }));
    app.use(
      serverEngine({
        cmd: 'start',
        loadEntries,
        env: process.env as any,
        unstable_onError: new Set(),
      }),
    );
    app.notFound((c) => {
      // FIXME better implementation using node stream?
      const file = path.join(distDir, DIST_PUBLIC, '404.html');
      if (existsSync(file)) {
        return c.html(readFileSync(file, 'utf8'), 404);
      }
      return c.text('404 Not Found', 404);
    });
    return app;
  };
  const port = parseInt(values.port || '8080', 10);
  await startServer(honoEnhancer(createApp)(new Hono()), port);
}

function startServer(app: Hono, port: number) {
  return new Promise<void>((resolve, reject) => {
    const server = serve({ ...app, port }, () => {
      console.log(`ready: Listening on http://localhost:${port}/`);
      resolve();
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(
          `warn: Port ${port} is in use, trying ${port + 1} instead.`,
        );
        startServer(app, port + 1)
          .then(resolve)
          .catch(reject);
      } else {
        console.error(`Failed to start server: ${err.message}`);
      }
    });
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
  --with-vercel         Output for Vercel on build
  --with-netlify        Output for Netlify on build
  --with-cloudflare     Output for Cloudflare on build
  --with-partykit       Output for PartyKit on build
  --with-deno           Output for Deno on build
  --with-aws-lambda     Output for AWS Lambda on build
  -p, --port            Port number for the server
  -v, --version         Display the version number
  -h, --help            Display this help message
`);
}

async function loadConfig(): Promise<Config> {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  const { loadServerModule } = await import('./lib/utils/vite-loader.js');
  const file = pathToFileURL(path.resolve(CONFIG_FILE)).toString();
  return (await loadServerModule<{ default: Config }>(file)).default;
}
