import { describe, expect, test } from 'vitest';

import { rscTransformPlugin } from '../src/lib/plugins/vite-plugin-rsc-transform.js';

describe('internal transform function for server environment', () => {
  const { transform } = rscTransformPlugin({
    isClient: false,
    isBuild: false,
  }) as {
    transform(
      code: string,
      id: string,
      options?: { ssr?: boolean },
    ): Promise<string | undefined>;
  };

  test('no transformation', async () => {
    const code = `
export default function App() {
  return <div>Hello World</div>;
}
`;
    expect(
      await transform(code, '/src/App.tsx', { ssr: true }),
    ).toBeUndefined();
  });

  test('top-level use client', async () => {
    const code = `
'use client';

export default function App() {
  return <div>Hello World</div>;
}
`;
    expect(
      await transform(code, '/src/App.tsx', { ssr: true }),
    ).toMatchInlineSnapshot(`
      "
      import { registerClientReference } from 'react-server-dom-webpack/server.edge';

      export default registerClientReference(() => { throw new Error('It is not possible to invoke a client function from the server: /src/App.tsx#default'); }, '/src/App.tsx', 'default');
      "
    `);
  });

  test('top-level use server', async () => {
    const code = `
'use server';

export const log = (mesg) => {
  console.log(mesg);
};
`;
    expect(
      await transform(code, '/src/App.tsx', { ssr: true }),
    ).toMatchInlineSnapshot(`
      "
      'use server';

      export const log = (mesg) => {
        console.log(mesg);
      };

      import { registerServerReference } from 'react-server-dom-webpack/server.edge';

      if (typeof log === 'function') {
        registerServerReference(log, '/src/App.tsx', 'log');
      }
      "
    `);
  });
});
