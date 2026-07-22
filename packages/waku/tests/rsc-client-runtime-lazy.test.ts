import { expect, test, vi } from 'vitest';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

// Sentinel modules that record evaluation. Mock factories are lazy, so these
// counters only move when something actually pulls the module in.
const evaluated = vi.hoisted(() => ({ client: 0, server: 0 }));

vi.mock('react-server-dom-webpack/client.edge', () => {
  evaluated.client += 1;
  return {
    createFromReadableStream: vi.fn(
      async (stream: ReadableStream<Uint8Array>) =>
        decoder.decode(
          new Uint8Array(await new Response(stream).arrayBuffer()),
        ),
    ),
  };
});

vi.mock('react-server-dom-webpack/server.edge', () => {
  evaluated.server += 1;
  return {
    renderToReadableStream: vi.fn(
      (element: unknown) =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(String(element)));
            controller.close();
          },
        }),
    ),
  };
});

// This file must import nothing else from the package, so the counters stay
// meaningful. Import order within the test is significant.
test('the RSC client runtime is evaluated only when deserializing', async () => {
  const { deserializeRsc, serializeRsc } = await import('../src/server.js');

  // Importing `waku/server` pulls the server runtime but not the client one.
  expect(evaluated.server).toBe(1);
  expect(evaluated.client).toBe(0);

  const bytes = await serializeRsc('cached element');
  expect(evaluated.client).toBe(0);

  // Deserializing loads it on demand, and still works.
  await expect(deserializeRsc(bytes)).resolves.toBe('cached element');
  expect(evaluated.client).toBe(1);

  // The dynamic import is cached, so repeat calls do not re-evaluate it.
  await expect(deserializeRsc(bytes)).resolves.toBe('cached element');
  expect(evaluated.client).toBe(1);
});
