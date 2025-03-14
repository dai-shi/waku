import { describe, expect, test } from 'vitest';

import { rscTransformPlugin } from '../src/lib/plugins/vite-plugin-rsc-transform.js';

describe('internal transform function for server environment', () => {
  const { transform } = rscTransformPlugin({
    isClient: false,
    isBuild: false,
    resolvedMap: new Map(),
  }) as {
    transform(
      code: string,
      id: string,
      options?: { ssr?: boolean },
    ): Promise<{ code: string; map?: string } | undefined>;
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

import { Component, createContext, useContext, memo } from 'react';
import { atom } from 'jotai/vanilla';
import { unstable_allowServer as allowServer } from 'waku/client';

const initialCount = 1;
const TWO = 2;
function double (x: number) {
  return x * TWO;
}
export const countAtom = allowServer(atom(double(initialCount)));

export const Empty = () => null;

function Private() {
  return "Secret";
}
const SecretComponent = () => <p>Secret</p>;
const SecretFunction = (n: number) => 'Secret' + n;

export function Greet({ name }: { name: string }) {
  return <>Hello {name}</>;
}

export class MyComponent extends Component {
  render() {
    return <p>Class Component</p>;
  }
}

const MyContext = createContext();

export const useMyContext = () => useContext(MyContext);

const MyProvider = memo(MyContext.Provider);

export const NAME = 'World';

export default function App() {
  return (
    <MyProvider value="Hello">
      <div>Hello World</div>
    </MyProvider>
  );
}
`;
    expect((await transform(code, '/src/App.tsx', { ssr: true }))?.code)
      .toMatchInlineSnapshot(`
      "import { registerClientReference as __waku_registerClientReference } from 'react-server-dom-webpack/server.edge';
      import { atom } from 'jotai/vanilla';
      const initialCount = 1;
      const TWO = 2;
      function double(x) {
          return x * TWO;
      }
      export const countAtom = __waku_registerClientReference(atom(double(initialCount)), "/src/App.tsx", "countAtom");
      export const Empty = __waku_registerClientReference(()=>{
          throw new Error('It is not possible to invoke a client function from the server: /src/App.tsx#Empty');
      }, '/src/App.tsx', 'Empty');
      export const Greet = __waku_registerClientReference(()=>{
          throw new Error('It is not possible to invoke a client function from the server: /src/App.tsx#Greet');
      }, '/src/App.tsx', 'Greet');
      export const MyComponent = __waku_registerClientReference(()=>{
          throw new Error('It is not possible to invoke a client function from the server: /src/App.tsx#MyComponent');
      }, '/src/App.tsx', 'MyComponent');
      export const useMyContext = __waku_registerClientReference(()=>{
          throw new Error('It is not possible to invoke a client function from the server: /src/App.tsx#useMyContext');
      }, '/src/App.tsx', 'useMyContext');
      export const NAME = __waku_registerClientReference(()=>{
          throw new Error('It is not possible to invoke a client function from the server: /src/App.tsx#NAME');
      }, '/src/App.tsx', 'NAME');
      export default __waku_registerClientReference(()=>{
          throw new Error('It is not possible to invoke a client function from the server: /src/App.tsx#default');
      }, '/src/App.tsx', 'default');
      "
    `);
  });

  test('top-level use server', async () => {
    const code = `
'use server';

const privateFunction = () => 'Secret';

export const log = async (mesg) => {
  console.log(mesg);
};

export async function greet(name) {
  return 'Hello ' + name;
}

export default async function() {
  return Date.now();
}
`;
    expect((await transform(code, '/src/App.tsx', { ssr: true }))?.code)
      .toMatchInlineSnapshot(`
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        const privateFunction = ()=>'Secret';
        export const log = __waku_registerServerReference(async (mesg)=>{
            console.log(mesg);
        }, "/src/App.tsx", "log");
        export async function greet(name) {
            return 'Hello ' + name;
        }
        __waku_registerServerReference(greet, "/src/App.tsx", "greet");
        export default __waku_registerServerReference(async function() {
            return Date.now();
        }, "/src/App.tsx", "default");
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
    expect((await transform(code, '/src/App.tsx', { ssr: true }))?.code)
      .toMatchInlineSnapshot(`
        "import type { ReactNode } from 'react';
        import { createAI } from 'ai/rsc';
        import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export const __waku_func1 = __waku_registerServerReference(async ()=>{
            return 0;
        }, "/src/App.tsx", "__waku_func1");
        const AI = createAI({
            actions: {
                foo: __waku_func1.bind(null)
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

  test('top-level use server and inline use server', async () => {
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

export async function exportedAction() {
  'use server';
  return null;
}

export default async () => null;
`;
    expect((await transform(code, '/src/App.tsx', { ssr: true }))?.code)
      .toMatchInlineSnapshot(`
        "import { InternalProvider } from './shared.js';
        import { jsx } from 'react/jsx-runtime';
        import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export async function __waku_func1({ action }, ...args) {
            return await action(...args);
        }
        __waku_registerServerReference(__waku_func1, "/src/App.tsx", "__waku_func1");
        const innerAction = __waku_func1.bind(null);
        function wrapAction(action) {
            return innerAction.bind(null, {
                action
            });
        }
        export async function exportedAction() {
            return null;
        }
        __waku_registerServerReference(exportedAction, "/src/App.tsx", "exportedAction");
        export default __waku_registerServerReference(async ()=>null, "/src/App.tsx", "default");
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
    expect((await transform(code, '/src/App.tsx', { ssr: true }))?.code)
      .toMatchInlineSnapshot(`
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export async function __waku_func1(a, mesg) {
            console.log(mesg, a);
        }
        __waku_registerServerReference(__waku_func1, "/src/App.tsx", "__waku_func1");
        export default function App({ a }) {
            const log = __waku_func1.bind(null, a);
            return <Hello log={log}/>;
        }
        "
      `);
  });

  test('inline use server (const function expression)', async () => {
    const code = `
export default function App() {
  const rand = Math.random();
  const log = async function (mesg, rand) {
    'use server';
    console.log(mesg, rand);
  };
  return <Hello log={log} />;
}
`;
    expect((await transform(code, '/src/App.tsx', { ssr: true }))?.code)
      .toMatchInlineSnapshot(`
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export const __waku_func1 = __waku_registerServerReference(async function(rand, mesg, rand) {
            console.log(mesg, rand);
        }, "/src/App.tsx", "__waku_func1");
        export default function App() {
            const rand = Math.random();
            const log = __waku_func1.bind(null, rand);
            return <Hello log={log}/>;
        }
        "
      `);
  });

  test('inline use server (const arrow function)', async () => {
    const code = `
const now = Date.now();
export default function App() {
  const log = async (mesg) => {
    'use server';
    console.log(mesg, now);
  };
  return <Hello log={log} />;
}
`;
    expect((await transform(code, '/src/App.tsx', { ssr: true }))?.code)
      .toMatchInlineSnapshot(`
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export const __waku_func1 = __waku_registerServerReference(async (mesg)=>{
            console.log(mesg, now);
        }, "/src/App.tsx", "__waku_func1");
        const now = Date.now();
        export default function App() {
            const log = __waku_func1.bind(null);
            return <Hello log={log}/>;
        }
        "
      `);
  });

  test('inline use server (anonymous arrow function)', async () => {
    const code = `
const now = Date.now();
export default function App() {
  return <Hello log={(mesg) => {
    'use server';
    console.log(mesg, now);
  }} />;
}
`;
    expect((await transform(code, '/src/App.tsx', { ssr: true }))?.code)
      .toMatchInlineSnapshot(`
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export const __waku_func1 = __waku_registerServerReference((mesg)=>{
            console.log(mesg, now);
        }, "/src/App.tsx", "__waku_func1");
        const now = Date.now();
        export default function App() {
            return <Hello log={__waku_func1.bind(null)}/>;
        }
        "
      `);
  });

  test('inline use server (various patterns)', async () => {
    const code = `
// in an object
const actions = {
  log: async (mesg) => {
    'use server';
    console.log(mesg);
  },
};

// non-exported function declaration
async function log2 (mesg) {
  'use server';
  console.log(mesg);
}

// non-exported const anonymous function expression
const log3 = async function(mesg) {
  'use server';
  console.log(mesg);
}

// non-exported const anonymous arrorw function
const log4 = async (mesg) => {
  'use server';
  console.log(mesg);
};

export default async function(mesg) {
  'use server';
  console.log(mesg);
}
`;
    expect((await transform(code, '/src/App.tsx', { ssr: true }))?.code)
      .toMatchInlineSnapshot(`
        "import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
        export const __waku_func1 = __waku_registerServerReference(async (mesg)=>{
            console.log(mesg);
        }, "/src/App.tsx", "__waku_func1");
        export async function __waku_func2(mesg) {
            console.log(mesg);
        }
        __waku_registerServerReference(__waku_func2, "/src/App.tsx", "__waku_func2");
        export const __waku_func3 = __waku_registerServerReference(async function(mesg) {
            console.log(mesg);
        }, "/src/App.tsx", "__waku_func3");
        export const __waku_func4 = __waku_registerServerReference(async (mesg)=>{
            console.log(mesg);
        }, "/src/App.tsx", "__waku_func4");
        export const __waku_func5 = __waku_registerServerReference(async function(mesg) {
            console.log(mesg);
        }, "/src/App.tsx", "__waku_func5");
        const actions = {
            log: __waku_func1.bind(null)
        };
        const log2 = __waku_func2.bind(null);
        const log3 = __waku_func3.bind(null);
        const log4 = __waku_func4.bind(null);
        export default __waku_func5.bind(null);
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
    ): Promise<{ code: string; map?: string } | undefined>;
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

const privateFunction = () => 'Secret';

// const function expression
export const log1 = async function(mesg) {
  console.log(mesg);
}

// const arrow function
export const log2 = async (mesg) => {
  console.log(mesg);
};

// function declaration
export async function log3(mesg) {
  console.log(mesg);
}

// default export
export default async function log4(mesg) {
  console.log(mesg);
}
`;
    expect((await transform(code, '/src/func.ts'))?.code)
      .toMatchInlineSnapshot(`
      "import { createServerReference } from 'react-server-dom-webpack/client';
      import { unstable_callServerRsc as callServerRsc } from 'waku/minimal/client';
      export const log1 = createServerReference('/src/func.ts#log1', callServerRsc);
      export const log2 = createServerReference('/src/func.ts#log2', callServerRsc);
      export const log3 = createServerReference('/src/func.ts#log3', callServerRsc);
      export default createServerReference('/src/func.ts#default', callServerRsc);
      "
    `);
  });

  test('top-level use server for SSR', async () => {
    const code = `
'use server';

import { getEnv } from 'waku';

const privateFunction = () => getEnv('SECRET');

export async function log(mesg) {
  console.log(mesg);
}
`;
    expect((await transform(code, '/src/func.ts', { ssr: true }))?.code)
      .toMatchInlineSnapshot(`
      "export const log = ()=>{
          throw new Error('You cannot call server functions during SSR');
      };
      "
    `);
  });
});
