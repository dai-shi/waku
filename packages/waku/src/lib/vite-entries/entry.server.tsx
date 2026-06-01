import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { setAllEnv } from '../env.js';

export { serverEntry as unstable_serverEntry };

export async function INTERNAL_runFetch(
  env: Readonly<Record<string, string>>,
  req: Request,
  ...args: any[]
) {
  setAllEnv(env);
  return serverEntry.fetch(req, ...args);
}

export default serverEntry.defaultExport;
