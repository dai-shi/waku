#!/usr/bin/env node
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import { resolveConfig } from './lib/config.js';
import { honoMiddleware as honoDevMiddleware } from './lib/middleware/hono-dev.js';
import { honoMiddleware as honoPrdMiddleware } from './lib/middleware/hono-prd.js';
import { build } from './lib/builder/build.js';

const require = createRequire(new URL('.', import.meta.url));
const { name, version } = require('../package.json');

// cli
const program = new Command();
program.name(name).version(version);

program
  .command('build')
  .description('Build the application for production')
  .option('--with-ssr', 'Use opt-in SSR')
  .option('--with-vercel', 'Output for Vercel on build')
  .option('--with-vercel-static', 'Output for Vercel static on build')
  .option('--with-cloudflare', 'Output for Cloudflare on build')
  .option('--with-deno', 'Output for Deno on build')
  .action((options) => {
    runBuild({
      ssr: !!options.withSsr,
      vercel: options.withVercelStatic
        ? 'static'
        : options.withVercel
          ? 'serverless'
          : false,
      cloudflare: !!options.withCloudflare,
      deno: !!options.withDeno,
    });
  });

program
  .command('dev')
  .description('Start the development server')
  .option('--with-ssr', 'Use opt-in SSR')
  .action((options) => {
    runDev({ ssr: !!options.withSsr });
  });

program
  .command('start')
  .description('Start the production server')
  .option('--with-ssr', 'Use opt-in SSR')
  .action((options) => {
    runStart({ ssr: !!options.withSsr });
  });

program.parse(process.argv);

// actions
async function runDev(options: { ssr: boolean }) {
  const app = new Hono();
  app.use('*', honoDevMiddleware({ ...options, env: loadEnv() }));
  const port = parseInt(process.env.PORT || '3000', 10);
  startServer(app, port);
}

async function runBuild(options: {
  ssr: boolean;
  vercel?: 'static' | 'serverless' | false;
  cloudflare?: boolean;
  deno?: boolean;
}) {
  await build({
    ...options,
    env: loadEnv(),
    vercel: {
      type: options.vercel ?? false,
    },
    cloudflare: !!options.cloudflare,
    deno: !!options.deno,
  });
}

async function runStart(options: { ssr: boolean }) {
  const { distDir, publicDir, entriesJs } = await resolveConfig({});
  const entries = import(
    pathToFileURL(path.resolve(distDir, entriesJs)).toString()
  );
  const app = new Hono();
  app.use('*', honoPrdMiddleware({ ...options, entries, env: loadEnv() }));
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
      console.error(`Failed to start server: ${err.message}`);
    }
  });
}

function loadEnv() {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
  };
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const [key, value] = line.split('=');
      if (key && value) {
        if (value.startsWith('"') && value.endsWith('"')) {
          env[key.trim()] = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          env[key.trim()] = value.slice(1, -1);
        } else {
          env[key.trim()] = value.trim();
        }
      }
    }
  }
  return env;
}
