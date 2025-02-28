type ErrorInfo = {
  status?: number;
  location?: string;
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
  return true;
};

const prefix = '__WAKU_CUSTOM_ERROR__;';

// This is an internal API and not for public use
export const createCustomError = (message: string, errorInfo: ErrorInfo) => {
  const err = new Error(message);
  (err as any).digest = prefix + JSON.stringify(errorInfo);
  return err;
};

export const getErrorInfo = (err: unknown) => {
  const digest = (err as any)?.digest;
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
