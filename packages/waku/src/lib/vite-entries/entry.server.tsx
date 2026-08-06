import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { unstable_setAllEnv } from '../env.js';

export { serverEntry as unstable_serverEntry };

export async function INTERNAL_runFetch(
  env: Readonly<Record<string, unknown>>,
  req: Request,
  ...args: any[]
) {
  unstable_setAllEnv(env);
  return serverEntry.fetch(req, ...args);
}

export default serverEntry.defaultExport;
