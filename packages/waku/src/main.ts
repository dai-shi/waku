export { Link, useRouter } from 'waku/router/client';

import type {
  createPages as createPagesType,
  getEnv as getEnvType,
} from './main.react-server.js';

export const createPages: typeof createPagesType = () => {
  throw new Error(
    '`createPages` is only available in react-server environment',
  );
};

export const getEnv: typeof getEnvType = () => {
  throw new Error('`getEnv` is only available in react-server environment');
};
