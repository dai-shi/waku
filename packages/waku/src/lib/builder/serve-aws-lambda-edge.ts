/* eslint import/no-unresolved: off */

import { Hono } from 'hono';
import { handle } from 'hono/lambda-edge'

import { honoMiddleware } from '../middleware/hono-prd.js';
// @ts-expect-error no types
import { CloudFrontResult } from 'hono/dist/types/adapter/lambda-edge/handler';

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const distDir = import.meta.env.WAKU_CONFIG_DIST_DIR;
// const publicDir = import.meta.env.WAKU_CONFIG_PUBLIC_DIR;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);
//// @ts-expect-error no types
const loadStaticFileList = () => import(distDir + '/s3-static-files.js');
const env = process.env as Record<string, string>;

const app = new Hono();
app.use('*', honoMiddleware({ loadEntries, ssr, env }));
app.use('*', async (c, next) => {
  await next()
  console.log(c)
  const staticFileList = (await loadStaticFileList()).default
  const path = c.req.path.toLowerCase()
  console.log('path', path)
  if (staticFileList.includes(path)) {
    // @ts-expect-error no types
    const orgin = c.env.request.origin.custom.domainName
    c.header('host', orgin)
    console.log('pass thru to S3', JSON.stringify(orgin))
  }
})

export const handler: CloudFrontResult = handle(app);
