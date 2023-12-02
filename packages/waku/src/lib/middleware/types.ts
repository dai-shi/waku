export type ReqObject = {
  stream: ReadableStream;
  url: string; // Full URL like "https://example.com/foo/bar?baz=qux"
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

export type ResObject = {
  stream: WritableStream;
  setHeader: (name: string, value: string) => void;
  setStatus: (code: number) => void;
};

export type Middleware<Req extends ReqObject, Res extends ResObject> = (
  req: Req,
  res: Res,
  next: (err?: unknown) => void,
) => void;
