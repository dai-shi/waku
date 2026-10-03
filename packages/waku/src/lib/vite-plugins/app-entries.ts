import type { Plugin } from 'vite';
import { SRC_CLIENT_ENTRY, SRC_SERVER_ENTRY } from '../constants.js';
import {
  getManagedClientEntry,
  getManagedServerEntry,
} from '../utils-build/managed.js';

export function appEntriesPlugin({ srcDir }: { srcDir: string }): Plugin {
  return {
    name: 'waku:vite-plugins:app-entries',
    // resolve user entries and fallbacks to "managed mode" if not found.
    async resolveId(source, _importer, options) {
      if (source === 'virtual:vite-rsc-waku/server-entry') {
        return '\0' + source;
      }
      if (source === 'virtual:vite-rsc-waku/server-entry-inner') {
        const resolved = await this.resolve(
          `/${srcDir}/${SRC_SERVER_ENTRY}`,
          undefined,
          options,
        );
        return resolved ? resolved : '\0' + source;
      }
      if (source === 'virtual:vite-rsc-waku/client-entry') {
        const resolved = await this.resolve(
          `/${srcDir}/${SRC_CLIENT_ENTRY}`,
          undefined,
          options,
        );
        return resolved ? resolved : '\0' + source;
      }
    },
    load(id) {
      if (id === '\0virtual:vite-rsc-waku/server-entry') {
        return `\
export { default } from 'virtual:vite-rsc-waku/server-entry-inner';
if (import.meta.hot) {
  import.meta.hot.accept()
}
`;
      }
      if (id === '\0virtual:vite-rsc-waku/server-entry-inner') {
        return getManagedServerEntry(srcDir);
      }
      if (id === '\0virtual:vite-rsc-waku/client-entry') {
        return getManagedClientEntry();
      }
    },
  };
}
