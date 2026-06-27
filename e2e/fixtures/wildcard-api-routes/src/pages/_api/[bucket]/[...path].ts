import type { ApiContext } from 'waku/router';

export function GET(
  _req: Request,
  { params }: ApiContext<'/[bucket]/[...path]'>,
) {
  return new Response(`${params.bucket}:${params.path.join('/')}`);
}
