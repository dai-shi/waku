export async function GET() {
  return new Response('Hello from API!');
}

export async function POST(req: Request) {
  return new Response(`POST Hello from API! ${await req.text()}`);
}
