import type { ReactNode } from 'react';
import type { default as RSDWServerType } from 'react-server-dom-webpack/server.edge';

import type { ConfigPrd } from '../config.js';
// TODO move types somewhere
import type { HandlerContext, ErrorCallback } from '../middleware/types.js';
import { filePathToFileURL } from '../utils/path.js';
import { streamToArrayBuffer } from '../utils/stream.js';
import { bufferToString, parseFormData } from '../utils/buffer.js';

const resolveClientEntryForPrd = (id: string, config: { basePath: string }) => {
  return config.basePath + id + '.js';
};

export async function renderRsc(
  config: ConfigPrd,
  ctx: Pick<HandlerContext, 'unstable_modules' | 'unstable_devServer'>,
  elements: Record<string, unknown>,
  onError: Set<ErrorCallback>,
  moduleIdCallback?: (id: string) => void,
): Promise<ReadableStream> {
  const modules = ctx.unstable_modules;
  if (!modules) {
    throw new Error('handler middleware required (missing modules)');
  }
  const {
    default: { renderToReadableStream },
  } = modules.rsdwServer as { default: typeof RSDWServerType };
  const resolveClientEntry = ctx.unstable_devServer
    ? ctx.unstable_devServer.resolveClientEntry
    : resolveClientEntryForPrd;
  const clientBundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [file, name] = encodedId.split('#') as [string, string];
        const id = resolveClientEntry(file, config);
        moduleIdCallback?.(id);
        return { id, chunks: [id], name, async: true };
      },
    },
  );
  return renderToReadableStream(elements, clientBundlerConfig, {
    onError: (err: unknown) => {
      onError.forEach((fn) => fn(err, ctx as HandlerContext, 'rsc'));
      if (typeof (err as any)?.digest === 'string') {
        // This is not correct according to the type though.
        return (err as { digest: string }).digest;
      }
    },
  });
}

export function renderRscElement(
  config: ConfigPrd,
  ctx: Pick<HandlerContext, 'unstable_modules' | 'unstable_devServer'>,
  element: ReactNode,
  onError: Set<ErrorCallback>,
): ReadableStream {
  const modules = ctx.unstable_modules;
  if (!modules) {
    throw new Error('handler middleware required (missing modules)');
  }
  const {
    default: { renderToReadableStream },
  } = modules.rsdwServer as { default: typeof RSDWServerType };
  const resolveClientEntry = ctx.unstable_devServer
    ? ctx.unstable_devServer.resolveClientEntry
    : resolveClientEntryForPrd;
  const clientBundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [file, name] = encodedId.split('#') as [string, string];
        const id = resolveClientEntry(file, config);
        return { id, chunks: [id], name, async: true };
      },
    },
  );
  return renderToReadableStream(element, clientBundlerConfig, {
    onError: (err: unknown) => {
      onError.forEach((fn) => fn(err, ctx as HandlerContext, 'rsc'));
      if (typeof (err as any)?.digest === 'string') {
        // This is not correct according to the type though.
        return (err as { digest: string }).digest;
      }
    },
  });
}

export async function collectClientModules(
  config: ConfigPrd,
  rsdwServer: { default: typeof RSDWServerType },
  elements: Record<string, unknown>,
): Promise<string[]> {
  const {
    default: { renderToReadableStream },
  } = rsdwServer;
  const idSet = new Set<string>();
  const clientBundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [file, name] = encodedId.split('#') as [string, string];
        const id = resolveClientEntryForPrd(file, config);
        idSet.add(id);
        return { id, chunks: [id], name, async: true };
      },
    },
  );
  const readable = renderToReadableStream(elements, clientBundlerConfig);
  await new Promise<void>((resolve, reject) => {
    const writable = new WritableStream({
      close() {
        resolve();
      },
      abort(reason) {
        reject(reason);
      },
    });
    readable.pipeTo(writable).catch(reject);
  });
  return Array.from(idSet);
}

export async function decodeBody(
  ctx: Pick<HandlerContext, 'unstable_modules' | 'unstable_devServer' | 'req'>,
): Promise<unknown> {
  const isDev = !!ctx.unstable_devServer;
  const modules = ctx.unstable_modules;
  if (!modules) {
    throw new Error('handler middleware required (missing modules)');
  }
  const {
    default: { decodeReply },
  } = modules.rsdwServer as { default: typeof RSDWServerType };
  const serverBundlerConfig = new Proxy(
    {},
    {
      get(_target, encodedId: string) {
        const [fileId, name] = encodedId.split('#') as [string, string];
        const id = isDev ? filePathToFileURL(fileId) : fileId + '.js';
        return { id, chunks: [id], name, async: true };
      },
    },
  );
  let decodedBody: unknown = ctx.req.url.searchParams;
  if (ctx.req.body) {
    const bodyBuf = await streamToArrayBuffer(ctx.req.body);
    const contentType = ctx.req.headers['content-type'];
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      // XXX This doesn't support streaming unlike busboy
      const formData = await parseFormData(bodyBuf, contentType);
      decodedBody = await decodeReply(formData, serverBundlerConfig);
    } else if (bodyBuf.byteLength > 0) {
      const bodyStr = bufferToString(bodyBuf);
      decodedBody = await decodeReply(bodyStr, serverBundlerConfig);
    }
  }
  return decodedBody;
}

const EXTRACT_FORM_STATE_SYMBOL = Symbol('EXTRACT_FORM_STATE');
type ExtractFormState = (
  actionResult: unknown,
) => ReturnType<(typeof RSDWServerType)['decodeFormState']>;

const setExtractFormState = (
  ctx: object,
  extractFormState: ExtractFormState,
) => {
  (
    ctx as unknown as Record<typeof EXTRACT_FORM_STATE_SYMBOL, ExtractFormState>
  )[EXTRACT_FORM_STATE_SYMBOL] = extractFormState;
};

export const getExtractFormState = (ctx: object): ExtractFormState => {
  const extractFormState = (
    ctx as unknown as Record<
      typeof EXTRACT_FORM_STATE_SYMBOL,
      ExtractFormState | undefined
    >
  )[EXTRACT_FORM_STATE_SYMBOL];
  if (!extractFormState) {
    throw new Error('extractFormState not set');
  }
  return extractFormState;
};

export async function decodePostAction(
  ctx: Pick<HandlerContext, 'unstable_modules' | 'unstable_devServer' | 'req'>,
): Promise<(() => Promise<unknown>) | null> {
  const isDev = !!ctx.unstable_devServer;
  const modules = ctx.unstable_modules;
  if (!modules) {
    throw new Error('handler middleware required (missing modules)');
  }
  const {
    default: { decodeAction, decodeFormState },
  } = modules.rsdwServer as { default: typeof RSDWServerType };
  if (ctx.req.body) {
    const contentType = ctx.req.headers['content-type'];
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      const [stream1, stream2] = ctx.req.body.tee();
      ctx.req.body = stream1;
      const bodyBuf = await streamToArrayBuffer(stream2);
      // XXX This doesn't support streaming unlike busboy
      const formData = await parseFormData(bodyBuf, contentType);
      if (
        Array.from(formData.keys()).every((key) => !key.startsWith('$ACTION_'))
      ) {
        // Assuming this is probably for api
        return null;
      }
      const serverBundlerConfig = new Proxy(
        {},
        {
          get(_target, encodedId: string) {
            const [fileId, name] = encodedId.split('#') as [string, string];
            const id = isDev ? filePathToFileURL(fileId) : fileId + '.js';
            return { id, chunks: [id], name, async: true };
          },
        },
      );
      setExtractFormState(ctx, (actionResult) =>
        decodeFormState(actionResult, formData, serverBundlerConfig),
      );
      return decodeAction(formData, serverBundlerConfig);
    }
  }
  return null;
}
