import { Hono } from 'hono';
import { unstable_honoMiddleware as honoDevMiddleware } from 'waku/dev';
import { unstable_honoMiddleware as honoProdMiddleware } from 'waku/prd';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { StreamingTextResponse } from 'ai';
import { OpenAI } from 'llamaindex/llm/LLM';
import { createChatEngine } from './lib/engine/index.js';
import { LlamaIndexStream } from './lib/llamaindex-stream.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import type { ChatMessage } from 'llamaindex/llm/types';
import type { LLM } from 'llamaindex';

const app = new Hono();

app.post('/api/chat', async (context) => {
  const body = await context.req.json();
  const {
    messages,
    data: { apiKey },
  } = body as {
    messages: { content: string; role: string }[];
    data: { apiKey: string };
  };
  const lastMessage = messages.pop();
  if (!apiKey) {
    return context.json(
      {
        error: 'apiKey is required in the request body',
      },
      400,
    );
  }
  if (!messages || !lastMessage || lastMessage.role !== 'user') {
    return context.json(
      {
        error:
          'messages are required in the request body and the last message must be from the user',
      },
      400,
    );
  } else {
    try {
      const llm = new OpenAI({
        apiKey,
        model: 'gpt-3.5-turbo',
      });

      const chatEngine = await createChatEngine(llm as LLM);

      const response = await chatEngine.chat({
        message: lastMessage.content,
        chatHistory: messages.map((message) => ({
          content: message.content,
          role: message.role,
        })) as ChatMessage[],
        stream: true,
      });

      const stream = LlamaIndexStream(response, {});

      return new StreamingTextResponse(stream);
    } catch (error) {
      return context.json(
        {
          error: (error as any).message,
        },
        500,
      );
    }
  }
});

if (process.env.NODE_ENV === 'development') {
  app.use(
    '*',
    honoDevMiddleware({
      config: {},
      env: process.env as Record<string, string>,
    }),
  );
} else {
  app.get(
    '*',
    serveStatic({
      root: './dist/public',
    }),
  );
  app.use(
    honoProdMiddleware({
      loadEntries: () =>
        import(
          pathToFileURL(
            join(dirname(fileURLToPath(import.meta.url)), 'dist', 'entries.js'),
          ).toString()
        ),
    }),
  );
}

const port = +(process.env.PORT || 3000);

serve(
  {
    ...app,
    port,
  },
  () => {
    console.log(`ready: Listening on http://localhost:${port}/`);
  },
);
