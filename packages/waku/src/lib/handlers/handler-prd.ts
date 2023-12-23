import type { EntriesPrd } from '../../server.js';
import { resolveConfig } from '../config.js';
import type { Config } from '../config.js';
import { endStream } from '../utils/stream.js';
import { renderHtml } from '../renderers/html-renderer.js';
import { decodeInput, hasStatusCode, deepFreeze } from '../renderers/utils.js';
import { renderRsc } from '../renderers/rsc-renderer.js';
import type { BaseReq, BaseRes, Handler } from './types.js';

export function createHandler<
  Context,
  Req extends BaseReq,
  Res extends BaseRes,
>(options: {
  config?: Config;
  ssr?: boolean;
  unstable_prehook?: (req: Req, res: Res) => Context;
  unstable_posthook?: (req: Req, res: Res, ctx: Context) => void;
  entries: Promise<EntriesPrd>;
}): Handler<Req, Res> {
  const { config, ssr, unstable_prehook, unstable_posthook, entries } = options;
  if (!unstable_prehook && unstable_posthook) {
    throw new Error('prehook is required if posthook is provided');
  }
  const configPromise = resolveConfig(config || {});

  return async (req, res, next) => {
    const config = await configPromise;
    const basePrefix = config.basePath + config.rscPath + '/';
    const handleError = (err: unknown) => {
      if (hasStatusCode(err)) {
        res.setStatus(err.statusCode);
      } else {
        console.info('Cannot render RSC', err);
        res.setStatus(500);
      }
      endStream(res.stream);
    };
    let context: Context | undefined;
    try {
      context = unstable_prehook?.(req, res);
    } catch (e) {
      handleError(e);
      return;
    }
    if (ssr) {
      try {
        const resolvedEntries = await entries;
        const { loadHtmlHead } = resolvedEntries;
        const readable = await renderHtml({
          config,
          reqUrl: req.url,
          htmlHead: loadHtmlHead(req.url.pathname),
          renderRscForHtml: (input) =>
            renderRsc({
              entries: resolvedEntries,
              config,
              input,
              method: 'GET',
              context,
              isDev: false,
            }),
          isDev: false,
          entries: resolvedEntries,
          isBuild: false,
        });
        if (readable) {
          unstable_posthook?.(req, res, context as Context);
          deepFreeze(context);
          res.setHeader('content-type', 'text/html; charset=utf-8');
          readable.pipeTo(res.stream);
          return;
        }
      } catch (e) {
        handleError(e);
        return;
      }
    }
    if (req.url.pathname.startsWith(basePrefix)) {
      const { method, contentType } = req;
      if (method !== 'GET' && method !== 'POST') {
        throw new Error(`Unsupported method '${method}'`);
      }
      const { skipRenderRsc } = await entries;
      try {
        const input = decodeInput(
          req.url.toString().slice(req.url.origin.length + basePrefix.length),
        );
        if (!skipRenderRsc(input)) {
          const readable = await renderRsc({
            config,
            input,
            method,
            context,
            body: req.stream,
            contentType,
            isDev: false,
            entries: await entries,
          });
          unstable_posthook?.(req, res, context as Context);
          deepFreeze(context);
          readable.pipeTo(res.stream);
          return;
        }
      } catch (e) {
        handleError(e);
        return;
      }
    }
    next();
  };
}
