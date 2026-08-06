type ErrorInfo = {
  status?: number;
  location?: string;
  unstable_leave?: boolean;
  // set by the client, read by no one in waku: an app decides its own recovery
  unstable_networkError?: boolean;
};

const isErrorInfo = (x: unknown): x is ErrorInfo => {
  if (typeof x !== 'object' || x === null) {
    return false;
  }
  if ('status' in x && typeof (x as ErrorInfo).status !== 'number') {
    return false;
  }
  if ('location' in x && typeof (x as ErrorInfo).location !== 'string') {
    return false;
  }
  if (
    'unstable_leave' in x &&
    typeof (x as ErrorInfo).unstable_leave !== 'boolean'
  ) {
    return false;
  }
  if (
    'unstable_networkError' in x &&
    typeof (x as ErrorInfo).unstable_networkError !== 'boolean'
  ) {
    return false;
  }
  return true;
};

const prefix = '__WAKU_CUSTOM_ERROR__;';

// This is an internal API and not for public use
export const createCustomError = (message: string, errorInfo: ErrorInfo) => {
  const err = new Error(message);
  (err as { digest?: string }).digest = prefix + JSON.stringify(errorInfo);
  return err;
};

export const getErrorInfo = (err: unknown) => {
  const digest = (err as { digest?: string } | undefined)?.digest;
  if (typeof digest !== 'string' || !digest.startsWith(prefix)) {
    return null;
  }
  try {
    const info = JSON.parse(digest.slice(prefix.length));
    if (isErrorInfo(info)) {
      return info;
    }
  } catch {
    // ignore
  }
  return null;
};
