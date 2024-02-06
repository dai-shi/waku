import { Hono } from 'hono';
import { honoMiddleware } from '../middleware/hono-prd.js';
import { handle, type LambdaContext, type LambdaEvent } from 'hono/aws-lambda';
import { serveStatic } from '@hono/node-server/serve-static';

const ssr = !!import.meta.env.WAKU_BUILD_SSR;
const distDir = import.meta.env.WAKU_CONFIG_DIST_DIR;
const publicDir = import.meta.env.WAKU_CONFIG_PUBLIC_DIR;
const loadEntries = () => import(import.meta.env.WAKU_ENTRIES_FILE!);

const env = process.env as Record<string, string>;

const app = new Hono();
app.use('*', serveStatic({ root: `${distDir}/${publicDir}` }));
app.use('*', honoMiddleware({ loadEntries, ssr, env }));

/*
 FIX: AWS HTTP API V2 breaks RSC POST requests url needed for server actions
    - AWS HTTP API V2 sets rawPath to a decoded path
    - We need to encode the string after /RSC/ and replace the orginal rawPath
    - Hono bug: https://github.com/honojs/hono/issues/2156
*/

const fixHTTPAPIV2 = (event: LambdaEvent) => {
  if ('version' in event && event?.version === '2.0') {
    if (
      'http' in event.requestContext &&
      event?.requestContext?.http?.method === 'POST' &&
      'rawPath' in event &&
      event?.rawPath?.startsWith('/RSC/')
    ) {
      const encodedRSCPath = encodeURIComponent(event.rawPath.substring(5));
      const url = new URL(event.rawPath, `http://${event.headers.host}`);
      url.pathname = `/RSC/${encodedRSCPath}`;
      event.rawPath = url.pathname;
      return event;
    }
  }
  return event;
};

const honoHandler = handle(app);
export const handler = (event: LambdaEvent, context: LambdaContext) => {
  return honoHandler(fixHTTPAPIV2(event), context);
};
