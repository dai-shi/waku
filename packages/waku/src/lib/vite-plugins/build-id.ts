import { randomBytes } from 'node:crypto';
import type { Plugin } from 'vite';
import { DEV_BUILD_ID } from '../constants.js';

const KEY = 'import.meta.env.WAKU_BUILD_ID';

export function buildIdPlugin(): Plugin {
  const buildId = randomBytes(6).toString('base64url');
  return {
    name: 'waku:vite-plugins:build-id',
    config(merged, env) {
      if (merged.define && KEY in merged.define) {
        return;
      }
      return {
        define: {
          [KEY]: JSON.stringify(
            env.command === 'serve' ? DEV_BUILD_ID : buildId,
          ),
        },
      };
    },
  };
}
