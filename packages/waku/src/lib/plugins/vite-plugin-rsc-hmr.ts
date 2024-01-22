import path from 'node:path';
import type { Plugin, TransformResult, ViteDevServer } from 'vite';

export type ModuleImportResult = TransformResult & {
  id: string;
  css?: boolean;
};

const customCode = `
import { createHotContext as __vite__createHotContext } from "/@vite/client";
import.meta.hot = __vite__createHotContext(import.meta.url);

if (import.meta.hot && !globalThis.__WAKU_HMR_CONFIGURED__) {
  globalThis.__WAKU_HMR_CONFIGURED__ = true;
  import.meta.hot.on('hot-import', (data) => import(/* @vite-ignore */ data));
  const removeSpinner = () => {
    const spinner = document.getElementById('waku-module-spinner');
    spinner?.nextSibling?.remove();
    spinner?.remove();
  }
  setTimeout(removeSpinner, 500);
  import.meta.hot.on('module-import', (data) => {
    // remove element with the same 'waku-module-id'
    let script = document.querySelector('script[waku-module-id="' + data.id + '"]');
    script?.remove();
    const code = data.code;
    script = document.createElement('script');
    script.type = 'module';
    script.text = code;
    script.setAttribute('waku-module-id', data.id);
    document.head.appendChild(script);
    if (data.css) removeSpinner();
  });
}
`;

export function rscHmrPlugin(opts: { srcDir: string; mainJs: string }): Plugin {
  let mainJsFile: string;
  return {
    name: 'rsc-hmr-plugin',
    enforce: 'post',
    configResolved(config) {
      mainJsFile = path.posix.join(config.root, opts.srcDir, opts.mainJs);
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', async: true },
          children: customCode,
          injectTo: 'head',
        },
        {
          tag: 'div',
          attrs: {
            id: 'waku-module-spinner',
            style:
              'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; font-family: sans-serif; font-size: 2rem; color: white; cursor: wait;',
          },
          children: 'Loading...',
          injectTo: 'head',
        },
      ];
    },
    transform(code, id, options) {
      if (options?.ssr) return;
      if (id === mainJsFile) {
        // FIXME this is pretty fragile, should we patch react-dom/client?
        return code.replace(
          'hydrateRoot(document.body, rootElement);',
          `
{
  const spinner = document.getElementById('waku-module-spinner');
  if (spinner) {
    const observer = new MutationObserver(() => {
      if (!document.contains(spinner)) {
        observer.disconnect();
        hydrateRoot(document.body, rootElement);
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  } else {
    hydrateRoot(document.body, rootElement);
  }
}
        `,
        );
      }
    },
  };
}

const pendingMap = new WeakMap<ViteDevServer, Set<string>>();

export function hotImport(vite: ViteDevServer, source: string) {
  let sourceSet = pendingMap.get(vite);
  if (!sourceSet) {
    sourceSet = new Set();
    pendingMap.set(vite, sourceSet);
    vite.ws.on('connection', () => {
      for (const source of sourceSet!) {
        vite.ws.send({ type: 'custom', event: 'hot-import', data: source });
      }
    });
  }
  sourceSet.add(source);
  vite.ws.send({ type: 'custom', event: 'hot-import', data: source });
}

const modulePendingMap = new WeakMap<ViteDevServer, Set<ModuleImportResult>>();

export function moduleImport(
  viteServer: ViteDevServer,
  result: ModuleImportResult,
) {
  let sourceSet = modulePendingMap.get(viteServer);
  if (!sourceSet) {
    sourceSet = new Set();
    modulePendingMap.set(viteServer, sourceSet);
    viteServer.ws.on('connection', () => {
      for (const result of sourceSet!) {
        viteServer.ws.send({
          type: 'custom',
          event: 'module-import',
          data: result,
        });
      }
    });
  }
  sourceSet.add(result);
  viteServer.ws.send({ type: 'custom', event: 'module-import', data: result });
}
