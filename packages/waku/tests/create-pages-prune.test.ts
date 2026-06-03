import { describe, expect, it, vi } from 'vitest';
import { createPages } from '../src/router/create-pages.js';

vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn().mockResolvedValue(null),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

const makeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });

describe('createPages - build-time pruning', () => {
  it('registers source file for each concrete static slug slice', async () => {
    // Regression: createSlice's static-slug branch returned before recording
    // the source file, so concrete slices were never marked prunable.
    const router = createPages(async ({ createSlice }) => {
      createSlice({
        render: 'static',
        id: 'preset/[id]',
        component: () => null,
        staticPaths: ['a', 'b'],
        unstable_sourceFile: 'pages/_slices/preset/[id].tsx',
      } as never);
      return null as never;
    });

    const register = vi.fn();
    await router.handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      parseRsc: vi.fn().mockResolvedValue({}),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPath2pathname: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: vi.fn().mockResolvedValue(undefined),
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: register,
    });

    expect(register).toHaveBeenCalledWith('pages/_slices/preset/[id].tsx');
  });
});
