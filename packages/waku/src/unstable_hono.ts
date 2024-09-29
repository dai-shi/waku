// These exports are for internal use only and subject to change without notice.

export { runner, getHonoContext } from './lib/hono/runner.js';

export const importHono = () => import('hono');
export const importHonoNodeServer: any = () => import('@hono/node-server');
export const importHonoNodeServerServeStatic = () =>
  import('@hono/node-server/serve-static');
export const importHonoAwsLambda: any = () => import('hono/aws-lambda');
