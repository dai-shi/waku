export async function GET() {
  return new Response('Hello from API!');
}

export async function POST(req: Request) {
  return new Response(`Hello from API! ${new URL(req.url).pathname}`);
}
