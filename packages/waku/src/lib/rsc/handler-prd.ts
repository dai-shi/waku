import type { Config } from '../../config.js';
import { resolveConfig } from '../config.js';
import { joinPath, filePathToFileURL, extname } from '../utils/path.js';
import { endStream } from '../utils/stream.js';
import { renderHtml } from './html-renderer.js';
import { decodeInput, hasStatusCode, deepFreeze } from './utils.js';
import { renderRsc } from '../rsc/rsc-renderer.js';
import type { BaseReq, BaseRes, Handler } from './types.js';

export function createHandler<
  Context,
  Req extends BaseReq,
  Res extends BaseRes,
>(options: {
  config: Config;
  ssr?: boolean;
  unstable_prehook?: (req: Req, res: Res) => Context;
  unstable_posthook?: (req: Req, res: Res, ctx: Context) => void;
}): Handler<Req, Res> {
  const { ssr, unstable_prehook, unstable_posthook } = options;
  if (!unstable_prehook && unstable_posthook) {
    throw new Error('prehook is required if posthook is provided');
  }
  const configPromise = resolveConfig(options.config);

  let publicIndexHtml: string | undefined;
  const getHtmlStr = async (pathStr: string): Promise<string | null> => {
    const config = await configPromise;
    if (!publicIndexHtml) {
      const publicIndexHtmlJsFile = joinPath(
        config.rootDir,
        config.distDir,
        config.htmlsDir,
        config.indexHtml + '.js',
      );
      publicIndexHtml = (await import(filePathToFileURL(publicIndexHtmlJsFile)))
        .default as string;
    }
    const destHtmlJsFile = joinPath(
      config.rootDir,
      config.distDir,
      config.htmlsDir,
      (extname(pathStr) ? pathStr : pathStr + '/' + config.indexHtml) + '.js',
    );
    try {
      return (await import(filePathToFileURL(destHtmlJsFile)))
        .default as string;
    } catch (e) {
      return publicIndexHtml;
    }
  };

  return async (req, res, next) => {
    const config = await configPromise;
    const basePrefix = config.basePath + config.rscPath + '/';
    const pathStr = req.url.slice(new URL(req.url).origin.length);
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
        const htmlStr = await getHtmlStr(pathStr);
        const result =
          htmlStr &&
          (await renderHtml(config, false, pathStr, htmlStr, context));
        if (result) {
          const [readable, nextCtx] = result;
          unstable_posthook?.(req, res, nextCtx as Context);
          readable.pipeTo(res.stream);
          return;
        }
      } catch (e) {
        handleError(e);
        return;
      }
    }
    if (pathStr.startsWith(basePrefix)) {
      const { method, contentType } = req;
      if (method !== 'GET' && method !== 'POST') {
        throw new Error(`Unsupported method '${method}'`);
      }
      try {
        const input = decodeInput(pathStr.slice(basePrefix.length));
        const readable = await renderRsc({
          config,
          input,
          method,
          context,
          body: req.stream,
          contentType,
          isDev: false,
        });
        unstable_posthook?.(req, res, context as Context);
        deepFreeze(context);
        readable.pipeTo(res.stream);
      } catch (e) {
        handleError(e);
      }
      return;
    }
    next();
  };
}
