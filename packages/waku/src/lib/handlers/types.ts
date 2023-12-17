export type BaseReq = {
  stream: ReadableStream;
  url: string; // Full URL like "https://example.com/foo/bar?baz=qux"
  method: string;
  contentType: string | undefined;
};

export type BaseRes = {
  stream: WritableStream;
  setHeader: (name: string, value: string) => void;
  setStatus: (code: number) => void;
};

export type Handler<Req extends BaseReq, Res extends BaseRes> = (
  req: Req,
  res: Res,
  next: (err?: unknown) => void,
) => void;
