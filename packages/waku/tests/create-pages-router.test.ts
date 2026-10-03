import { describe, expect, it, vi } from 'vitest';
import { createConfiguredRouter } from '../src/router/create-pages-utils/router.js';
import { serializeRsc } from '../src/server.js';

vi.mock('../src/server.js', () => ({
  deserializeRsc: async () => null,
  serializeRsc: vi.fn(async () => new Uint8Array([1])),
}));

describe('createPages router integration', () => {
  it('shares its immutable template cache across concrete routes', async () => {
    vi.mocked(serializeRsc).mockClear();
    const routeRenderer = vi.fn(() => null);
    const router = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'route',
          path: [{ type: 'group', name: 'id' }],
          isStatic: false,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: routeRenderer },
          elements: {
            content: {
              isStatic: false,
              renderer: ({ routePath }) => routePath,
            },
          },
        },
      ],
    });
    const renderRsc = vi.fn(
      async () =>
        new ReadableStream({ start: (controller) => controller.close() }),
    );
    const utils = {
      renderRsc,
      renderHtml: vi.fn(),
      loadBuildMetadata: vi.fn(),
    };
    for (const path of ['/one', '/two']) {
      await router.handleRequest(
        {
          type: 'rsc',
          rscPath: 'R' + path,
          rscParams: undefined,
          pathname: '/RSC/payload.txt',
          req: new Request('http://localhost/RSC/payload.txt'),
        },
        utils,
      );
    }
    expect(routeRenderer).toHaveBeenCalledTimes(1);
    expect(serializeRsc).toHaveBeenCalledTimes(2);
    expect(renderRsc).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '/two' }),
      expect.anything(),
    );
  });
});
