import { getPluginApi } from '@vitejs/plugin-rsc';
import type { Plugin } from 'vite';

/**
 * Finds server functions that only client code imports, which plugin-rsc's
 * build does not look for, by scanning the client graph before that build.
 */
export function scanClientPlugin(): Plugin {
  return {
    name: 'waku:vite-plugins:scan-client',
    buildApp: {
      order: 'pre',
      async handler(builder) {
        const { manager } = getPluginApi(builder.config)!;
        const rsc = builder.environments.rsc!;
        const client = builder.environments.client!;
        const { isScanBuild } = manager;
        const rscWrite = rsc.config.build.write;
        const clientWrite = client.config.build.write;
        manager.isScanBuild = true;
        rsc.config.build.write = false;
        client.config.build.write = false;
        try {
          await builder.build(rsc);
          await builder.build(client);
        } finally {
          manager.isScanBuild = isScanBuild;
          rsc.config.build.write = rscWrite;
          client.config.build.write = clientWrite;
        }
      },
    },
  };
}
