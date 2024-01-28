import type {
  HtmlTagDescriptor,
  Plugin,
  TransformResult,
  ViteDevServer,
} from 'vite';

export type ModuleImportResult = TransformResult & {
  id: string;
  // non-transformed result of `TransformResult.code`
  source: string;
  css?: boolean;
};

const customCode = `
import { createHotContext as __vite__createHotContext } from "/@vite/client";
import.meta.hot = __vite__createHotContext(import.meta.url);

if (import.meta.hot && !globalThis.__WAKU_HMR_CONFIGURED__) {
  globalThis.__WAKU_HMR_CONFIGURED__ = true;
  import.meta.hot.on('hot-import', (data) => import(/* @vite-ignore */ data));
  import.meta.hot.on('module-import', (data) => {
    // remove element with the same 'waku-module-id'
    let script = document.querySelector('script[waku-module-id="' + data.id + '"]');
    let style = document.querySelector('style[waku-module-id="' + data.id + '"]');
    script?.remove();
    const code = data.code;
    script = document.createElement('script');
    script.type = 'module';
    script.text = code;
    script.setAttribute('waku-module-id', data.id);
    document.head.appendChild(script);
    // avoid HMR flash by first applying the new and removing the old styles 
    if (style) {
      queueMicrotask(style.remove);
    }
  });
}
`;

export function rscHmrPlugin(): Plugin {
  let viteServer: ViteDevServer;
  return {
    name: 'rsc-hmr-plugin',
    enforce: 'post',
    configureServer(server) {
      viteServer = server;
    },
    async transformIndexHtml() {
      return [
        ...(await generateInitialScripts(viteServer)),
        {
          tag: 'script',
          attrs: { type: 'module', async: true },
          children: customCode,
          injectTo: 'head',
        },
      ];
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
  }
  sourceSet.add(result);
  viteServer.ws.send({ type: 'custom', event: 'module-import', data: result });
}

async function generateInitialScripts(
  viteServer: ViteDevServer,
): Promise<HtmlTagDescriptor[]> {
  const sourceSet = modulePendingMap.get(viteServer);

  if (!sourceSet) {
    return [];
  }

  const scripts: HtmlTagDescriptor[] = [];
  for (const result of sourceSet) {
    scripts.push({
      tag: 'style',
      attrs: { type: 'text/css', 'waku-module-id': result.id },
      children: result.source,
      injectTo: 'head-prepend',
    });
  }
  return scripts;
}
