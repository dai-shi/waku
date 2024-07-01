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

  test('inline use server (function declaration)', async () => {
    const code = `
export default function App() {
  function log(mesg) {
    'use server';
    console.log(mesg);
  }
  return <Hello log={log} />;
}
`;
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export const __waku_serverActions = new Map();
        let __waku_actionIndex = 0;
        function __waku_registerServerAction(fn, actionId) {
            const actionName = 'action' + __waku_actionIndex++;
            __waku_registerServerReference(fn, actionId, actionName);
            __waku_serverActions.set(actionName, fn);
            return fn;
        }
        export default function App() {
            function log(mesg) {
                'use server';
                console.log(mesg);
            }
            __waku_registerServerAction(log, "/src/App.tsx");
            return <Hello log={log}/>;
        }
        "
      `);
  });

  test('inline use server (const function expression)', async () => {
    const code = `
export default function App() {
  const log = function (mesg) {
    'use server';
    console.log(mesg);
  };
  return <Hello log={log} />;
}
`;
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
      "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
      export const __waku_serverActions = new Map();
      let __waku_actionIndex = 0;
      function __waku_registerServerAction(fn, actionId) {
          const actionName = 'action' + __waku_actionIndex++;
          __waku_registerServerReference(fn, actionId, actionName);
          __waku_serverActions.set(actionName, fn);
          return fn;
      }
      export default function App() {
          const log = __waku_registerServerAction(function(mesg) {
              'use server';
              console.log(mesg);
          }, "/src/App.tsx");
          return <Hello log={log}/>;
      }
      "
    `);
  });

  test('inline use server (const arrow function)', async () => {
    const code = `
export default function App() {
  const log = (mesg) => {
    'use server';
    console.log(mesg);
  };
  return <Hello log={log} />;
}
`;
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
      "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
      export const __waku_serverActions = new Map();
      let __waku_actionIndex = 0;
      function __waku_registerServerAction(fn, actionId) {
          const actionName = 'action' + __waku_actionIndex++;
          __waku_registerServerReference(fn, actionId, actionName);
          __waku_serverActions.set(actionName, fn);
          return fn;
      }
      export default function App() {
          const log = __waku_registerServerAction((mesg)=>{
              'use server';
              console.log(mesg);
          }, "/src/App.tsx");
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
      export const __waku_serverActions = new Map();
      let __waku_actionIndex = 0;
      function __waku_registerServerAction(fn, actionId) {
          const actionName = 'action' + __waku_actionIndex++;
          __waku_registerServerReference(fn, actionId, actionName);
          __waku_serverActions.set(actionName, fn);
          return fn;
      }
      const actions = {
          log: __waku_registerServerAction((mesg)=>{
              'use server';
              console.log(mesg);
          }, "/src/App.tsx")
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
