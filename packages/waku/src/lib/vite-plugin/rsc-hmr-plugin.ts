import path from 'node:path';
import type { Plugin, TransformResult, ViteDevServer } from 'vite';

const customCode = `
import { createHotContext as __vite__createHotContext } from "/@vite/client"
import.meta.hot = __vite__createHotContext(import.meta.url);

if (import.meta.hot && !globalThis.__WAKU_HMR_CONFIGURED__) {
  globalThis.__WAKU_HMR_CONFIGURED__ = true;
  import.meta.hot.on('hot-import', (data) => import(/* @vite-ignore */ data));

  import.meta.hot.on('module', (data) => {
    const code = data.code

    const script = document.createElement('script')
    script.type = 'module'
    script.text = code
    document.head.appendChild(script)
  });
}
`;

export function rscHmrPlugin(): Plugin {
  return {
    name: 'rsc-hmr-plugin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(
        '</body>',
        `<script type="module">${customCode}</script></body>`,
      );
    },
    async transform(code, id) {
      const ext = path.extname(id);
      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        // return code + customCode;
      }
      return code;
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

const modulePendingMap = new WeakMap<ViteDevServer, Set<TransformResult>>();

export function moduleImport(vite: ViteDevServer, result: TransformResult) {
  let sourceSet = modulePendingMap.get(vite);
  if (!sourceSet) {
    sourceSet = new Set();
    modulePendingMap.set(vite, sourceSet);
    vite.ws.on('connection', () => {
      for (const result of sourceSet!) {
        vite.ws.send({ type: 'custom', event: 'module', data: result });
      }
    });
  }
  sourceSet.add(result);
  vite.ws.send({ type: 'custom', event: 'module', data: result });
}
