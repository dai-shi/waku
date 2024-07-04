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
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export const log = (mesg)=>{
            console.log(mesg);
        };
        if (typeof log === "function") {
            __waku_registerServerReference(log, "/src/App.tsx", "log");
        }
        "
      `);
  });

  test('server action in object', async () => {
    const code = `
import type { ReactNode } from 'react';
import { createAI } from 'ai/rsc';

const AI = createAI({
  actions: {
    foo: async () => {
      'use server';
      return 0;
    },
  },
});

export function ServerProvider({ children }: { children: ReactNode }) {
  return <AI>{children}</AI>;
}
`;
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
        "import type { ReactNode } from 'react';
        import { createAI } from 'ai/rsc';
        import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export const __waku_action1 = __waku_registerServerReference(async ()=>{
            return 0;
        }, "/src/App.tsx", "__waku_action1");
        const AI = createAI({
            actions: {
                foo: __waku_action1.bind(null)
            }
        });
        export function ServerProvider({ children }: {
            children: ReactNode;
        }) {
            return <AI>{children}</AI>;
        }
        "
      `);
  });

  test('create server with bind', async () => {
    const code = `
'use server';
import { InternalProvider } from './shared.js';
import { jsx } from 'react/jsx-runtime';

async function innerAction({ action }, ...args) {
  'use server';
  return await action(...args);
}

function wrapAction(action) {
  return innerAction.bind(null, { action });
}

export function createAI({ actions }) {
  const wrappedActions = {};
  for (const name in actions) {
    wrappedActions[name] = wrapAction(actions[name]);
  }
  return function AI(props) {
    return jsx(InternalProvider, {
      actions: wrappedActions,
      children: props.children,
    });
  };
}`;
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
        "import { InternalProvider } from './shared.js';
        import { jsx } from 'react/jsx-runtime';
        import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export async function __waku_action1({ action }, ...args) {
            return await action(...args);
        }
        __waku_registerServerReference(__waku_action1, "/src/App.tsx", "__waku_action1");
        const innerAction = __waku_action1.bind(null);
        function wrapAction(action) {
            return innerAction.bind(null, {
                action
            });
        }
        export function createAI({ actions }) {
            const wrappedActions = {};
            for(const name in actions){
                wrappedActions[name] = wrapAction(actions[name]);
            }
            return function AI(props) {
                return jsx(InternalProvider, {
                    actions: wrappedActions,
                    children: props.children
                });
            };
        }
        if (typeof createAI === "function") {
            __waku_registerServerReference(createAI, "/src/App.tsx", "createAI");
        }
        "
      `);
  });

  test('inline use server (function declaration)', async () => {
    const code = `
export default function App({ a }) {
  async function log(mesg) {
    'use server';
    console.log(mesg, a);
  }
  return <Hello log={log} />;
}
`;
    expect(await transform(code, '/src/App.tsx', { ssr: true }))
      .toMatchInlineSnapshot(`
      "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
      export async function __waku_action1(a, mesg) {
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
  log: async (mesg) => {
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
        export const __waku_action1 = __waku_registerServerReference(async (mesg)=>{
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
