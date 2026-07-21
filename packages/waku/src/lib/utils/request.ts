import type { ReactFormState } from 'react-dom/client';
import type { Config } from '../../config.js';
import type { Unstable_HandleRequest as HandleRequest } from '../types.js';
import { decodeFuncId, decodeRscPath } from '../utils/rsc-path.js';
import { createCustomError } from './custom-errors.js';
import { ETAGS_HEADER, parseClientEtags } from './etags.js';
import { removeBase } from './path.js';

type HandleRequestInput = Parameters<HandleRequest>[0];

export async function getInput(
  req: Request,
  config: Omit<Required<Config>, 'vite'>,
  temporaryReferences: unknown,
  decodeReply: (
    body: string | FormData,
    options?: object,
  ) => Promise<unknown[]>,
  decodeAction: (body: FormData) => Promise<() => Promise<void>> | null,
  decodeFormState: (
    actionResult: unknown,
    body: FormData,
  ) => Promise<ReactFormState | undefined>,
  loadServerAction: (id: string) => Promise<unknown>,
) {
  const url = new URL(req.url);
  const pathname = removeBase(url.pathname, config.basePath);
  const rscPathPrefix = '/' + config.rscBase + '/';
  const etags = parseClientEtags(req.headers.get(ETAGS_HEADER));
  let rscPath: string | undefined;
  let input: HandleRequestInput;
  if (pathname.startsWith(rscPathPrefix)) {
    rscPath = decodeRscPath(pathname.slice(rscPathPrefix.length));
    // server action: js
    const actionId = decodeFuncId(rscPath);
    if (actionId) {
      validateServerActionRequest(req);
      const body = await getActionBody(req);
      const args = await decodeReply(body, { temporaryReferences });
      const action = await loadServerAction(actionId);
      input = {
        type: 'call',
        fn: action as never,
        args,
        pathname,
        req,
        etags,
      };
    } else {
      // client RSC request
      let rscParams: unknown = url.searchParams;
      if (req.body) {
        validateServerActionRequest(req);
        const body = await getActionBody(req);
        rscParams = await decodeReply(body, {
          temporaryReferences,
        });
      }
      input = {
        type: 'rsc',
        rscPath,
        rscParams,
        pathname,
        req,
        etags,
      };
    }
  } else if (req.method === 'POST') {
    const contentType = req.headers.get('content-type');
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      // possibly a no-js server action submission (progressive enhancement)
      let parsing:
        | Promise<
            | { action: true; formState: unknown }
            | { action: false; formData: FormData }
          >
        | undefined;
      input = {
        type: 'http',
        tryAction: () =>
          (parsing ??= (async () => {
            const formData = (await getActionBody(req)) as FormData;
            const decodedAction = await decodeAction(formData);
            if (typeof decodedAction !== 'function') {
              return { action: false as const, formData };
            }
            validateServerActionRequest(req);
            const result = await decodedAction();
            const formState = await decodeFormState(result, formData);
            return { action: true as const, formState };
          })()),
        pathname,
        req,
        etags,
      };
    } else {
      // POST API request
      input = {
        type: 'http',
        pathname,
        req,
        etags,
      };
    }
  } else {
    // SSR
    input = {
      type: 'http',
      pathname,
      req,
      etags,
    };
  }
  return input;
}

function validateServerActionRequest(req: Request) {
  if (req.method !== 'POST') {
    throw createCustomError('Method Not Allowed', { status: 405 });
  }
  const origin = req.headers.get('origin');
  if (origin) {
    if (origin === 'null') {
      throw createCustomError('Forbidden', { status: 403 });
    }
    const requestOrigin = new URL(req.url).origin;
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      throw createCustomError('Forbidden', { status: 403 });
    }
    if (originUrl.origin !== requestOrigin) {
      throw createCustomError('Forbidden', { status: 403 });
    }
  } else if (req.headers.get('sec-fetch-site') === 'cross-site') {
    throw createCustomError('Forbidden', { status: 403 });
  }
}

async function getActionBody(req: Request) {
  if (!req.body) {
    throw new Error('missing request body for server function');
  }
  const contentType = req.headers.get('content-type');
  if (contentType?.startsWith('multipart/form-data')) {
    return req.formData();
  } else {
    return req.text();
  }
}
