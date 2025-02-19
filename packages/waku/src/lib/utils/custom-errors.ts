// This is an internal API and not for public use
export const createCustomError = (
  message: string,
  statusCode: number,
  locationHeader?: string,
) => {
  const err = new Error(message);
  (err as any).statusCode = statusCode;
  if (locationHeader) {
    (err as any).locationHeader = locationHeader;
  }
  return err;
};

export const hasStatusCode = (x: unknown): x is { statusCode: number } =>
  typeof (x as any)?.statusCode === 'number';

export const hasLocationHeader = (
  x: unknown,
): x is { locationHeader: string } =>
  typeof (x as any)?.locationHeader === 'string';
