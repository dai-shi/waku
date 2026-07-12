import type { UserConfig } from 'vite';
import { expect, test } from 'vitest';
import type { Config } from '../src/config.js';
import { resolveConfig } from '../src/lib/utils/config.js';
import { environmentsPlugin } from '../src/lib/vite-plugins/environments.js';

const runConfigHook = async (config: Config): Promise<UserConfig> => {
  const plugin = environmentsPlugin(resolveConfig(config));
  const hook = plugin.config;
  if (!(typeof hook === 'function')) {
    throw new Error('Plugin config is not defined');
  }
  return (await hook.call(
    {} as never,
    {},
    {
      command: 'build',
      mode: 'production',
    },
  )) as UserConfig;
};

test('uses basePath as the default Vite base', async () => {
  const config = await runConfigHook({
    basePath: '/custom/base/',
  });

  expect(config.base).toBe('/custom/base/');
});

test('lets user-provided Vite base override basePath', async () => {
  const config = await runConfigHook({
    basePath: '/custom/base/',
    vite: {
      base: 'https://cdn.example.com/assets/',
    },
  });

  expect(config.base).toBe('https://cdn.example.com/assets/');
});
