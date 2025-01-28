import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { type } from 'arktype';

let serverName: string | undefined;

const nameSchema = type({
  name: 'string',
});

const app = new Hono()
  .basePath('/api/hono')
  .post(
    '/hello',
    async (c) => {
      const body = await c.req.json();
      const result = nameSchema(body);

      if (result instanceof type.errors) {
        return c.json(
          {
            error: 'Validation Error',
            details: result.join(', '),
          },
          400,
        );
      }

      serverName = result.name;
      return c.json({ message: `Hello ${serverName}!` });
    },
    async (c) => {
      const { name } = await c.req.json();
      serverName = name;
      return c.json({ message: `Hello ${name}!` });
    },
  )
  .get('/hello', async (c) => {
    return c.json({
      message: serverName
        ? `Hello ${serverName}!`
        : 'Hmm, I don’t know your name.',
    });
  });

export type AppType = typeof app;
export const GET = handle(app);
export const POST = handle(app);
