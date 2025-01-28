import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { type } from 'arktype';
import { arktypeValidator } from '@hono/arktype-validator';

let serverName: string | undefined;

const nameSchema = type({
  name: 'string',
});

const app = new Hono()
  .basePath('/api/hono')
  .post(
    '/hello',
    arktypeValidator('json', nameSchema, (result, c) => {
      if (!result.success) {
        return c.text('Invalid!', 400);
      }
    }),
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
