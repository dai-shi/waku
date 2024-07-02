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
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
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
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
        "
        import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        ;

        export const log = (mesg) => {
          console.log(mesg);
        };

        if (typeof log === 'function') {
          __waku_registerServerReference(log, '/src/App.tsx', 'log');
        }
        "
      `);
  });

  test('inline use server (function declaration)', async () => {
    const code = `
export default function App({ a }) {
  function log(mesg) {
    'use server';
    console.log(mesg, a);
  }
  return <Hello log={log} />;
}
`;
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export function __waku_action1(a, mesg) {
            console.log(mesg, a);
        }
        __waku_registerServerReference(__waku_action1, "/src/App.tsx", "__waku_action1");
        export default function App({ a }) {
            const log = __waku_action1.bind(null, a);
            return <Hello log={log}/>;
        }
        "
      `);
  });

  test('inline use server (const function expression)', async () => {
    const code = `
export default function App() {
  const rand = Math.random();
  const log = function (mesg, rand) {
    'use server';
    console.log(mesg, rand);
  };
  return <Hello log={log} />;
}
`;
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export const __waku_action1 = __waku_registerServerReference(function(rand, mesg, rand) {
            console.log(mesg, rand);
        }, "/src/App.tsx", "__waku_action1");
        export default function App() {
            const rand = Math.random();
            const log = __waku_action1.bind(null, rand);
            return <Hello log={log}/>;
        }
        "
      `);
  });

  test('inline use server (const arrow function)', async () => {
    const code = `
const now = Date.now();
export default function App() {
  const log = (mesg) => {
    'use server';
    console.log(mesg, now);
  };
  return <Hello log={log} />;
}
`;
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export const __waku_action1 = __waku_registerServerReference((mesg)=>{
            console.log(mesg, now);
        }, "/src/App.tsx", "__waku_action1");
        const now = Date.now();
        export default function App() {
            const log = __waku_action1.bind(null);
            return <Hello log={log}/>;
        }
        "
      `);
  });

  test('inline use server (in an object)', async () => {
    const code = `
const actions = {
  log: (mesg) => {
    'use server';
    console.log(mesg);
  },
};
export default function App() {
  return <Hello log={actions.log} />;
}
`;
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export const __waku_action1 = __waku_registerServerReference((mesg)=>{
            console.log(mesg);
        }, "/src/App.tsx", "__waku_action1");
        const actions = {
            log: __waku_action1.bind(null)
        };
        export default function App() {
            return <Hello log={actions.log}/>;
        }
        "
      `);
  });
});

describe('internal transform function for client environment', () => {
  const { transform } = rscTransformPlugin({
    isClient: true,
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
export const log = (mesg) => {
  console.log(mesg);
};
`;
    expect(await transform(code, '/src/func.ts')).toBeUndefined();
  });

  test('top-level use server', async () => {
    const code = `
'use server';

export const log = (mesg) => {
  console.log(mesg);
};
`;
    expect(await transform(code, '/src/func.ts')).toMatchInlineSnapshot(`
      "
      import { createServerReference } from 'react-server-dom-webpack/client';
      import { callServerRSC } from 'waku/client';

      export const log = createServerReference('/src/func.ts#log', callServerRSC);
      "
    `);
  });
});
