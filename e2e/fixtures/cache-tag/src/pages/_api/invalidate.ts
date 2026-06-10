import { invalidate } from '../../lib/waku-cache.js';

export async function GET() {
  invalidate('cached-page');
  return new Response('ok');
}
