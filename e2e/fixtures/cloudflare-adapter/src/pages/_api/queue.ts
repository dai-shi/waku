// eslint-disable-next-line import/no-unresolved
import { env } from 'cloudflare:workers';
import { queueState } from '../../queue-state.js';

export async function POST(request: Request) {
  await env.QUEUE.send(await request.text());
  return new Response('sent');
}

export function GET() {
  return new Response(queueState.message);
}
