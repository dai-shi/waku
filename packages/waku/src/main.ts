export { Link, useRouter_UNSTABLE } from 'waku/router/client';

import type {
  createPages as createPagesType,
  new_createPages as new_createPagesType,
  getEnv as getEnvType,
} from './main.react-server.js';

export const createPages: typeof createPagesType = () => {
  throw new Error(
    '`createPages` is only available in react-server environment',
  );
};

export const new_createPages: typeof new_createPagesType = () => {
  throw new Error(
    '`new_createPagesType` is only available in react-server environment',
  );
};

export const getEnv: typeof getEnvType = () => {
  throw new Error('`getEnv` is only available in react-server environment');
};
