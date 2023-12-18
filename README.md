# Waku

⛩️ The minimal React framework

[![CI](https://img.shields.io/github/actions/workflow/status/dai-shi/waku/ci.yml?branch=main)](https://github.com/dai-shi/waku/actions?query=workflow%3ACI)
[![npm](https://img.shields.io/npm/v/waku)](https://www.npmjs.com/package/waku)
[![discord](https://img.shields.io/discord/627656437971288081)](https://discord.gg/MrQdmzd)

<!-- [![size](https://img.shields.io/bundlephobia/minzip/waku)](https://bundlephobia.com/result?p=waku) -->

Waku means "frame" in Japanese. Waku-Waku means being excited.
https://github.com/dai-shi/waku/discussions/260

## Project status

Roadmap: See https://github.com/dai-shi/waku/issues/24 (working towards v1-alpha)

Feel free to try it _seriously_ with non-production projects and give us feedback.

Playground: https://codesandbox.io/p/sandbox/waku-example-counter-mdc1yb

## Introduction

Waku is a React framework that supports React Server Components
(RSCs), a new feature that will be available in a future version of
React. RSCs allow developers to render UI components on the server,
improving performance and enabling server-side features. To use RSCs,
a framework is necessary for bundling, optionally server, router and
so on.

Waku takes a minimalistic approach, providing a minimal API that
allows for multiple feature implementations and encourages growth in
the ecosystem. For example, the minimal API is not tied to a specific
router. This flexibility makes it easier to build new features.

Waku uses Vite internally, and while it is still a work in progress,
it will eventually support all of Vite's features. It can even
work as a replacement for Vite + React client components. While using
RSCs is optional, it is highly recommended for improved user and
developer experiences.

## Why develop a React framework?

We believe that React Server Components (RSCs) are the future of React.
The challenge is that we can't utilize RSCs with the React library alone.
Instead, they require a React framework for bundling, at the very least.

Currently, only a few React frameworks support RSCs, and
they often come with more features than RSCs.
It would be nice to have a minimal framework that implements RSCs,
which should help learning how RSCs work.

Learning is the start, but it's not what we aim at.
Our assumption is that RSC best practices are still to explore.
The minimal implementation should clarify the fundamentals of RSCs
and enable the creation of additional features.
Our goal is to establish an ecosystem that covers a broader range of use cases.

## How to create a new project

To start a new Waku project, you can use any of the following
commands, depending on your preferred package manager:

```sh
npm create waku@latest
```

```sh
yarn create waku
```

```sh
pnpm create waku
```

These commands will create an example app that you can use as a
starting point for your project.

Minimum requirement: Node.js 18.3.0

## Practices

### Minimal

#### Server API

To use React Server Components in Waku, you need to create an
`entries.ts` file in the project root directory with a
`renderEntries` function that returns a server component module.
Here's an example:

```tsx
import { lazy } from 'react';
import { defineEntries } from 'waku/server';

const App = lazy(() => import('./components/App.js'));

export default defineEntries(
  // renderEntries
  async (input) => {
    return {
      App: <App name={input || 'Waku'} />,
    };
  },
);
```

The `id` parameter is the ID of the React Server Component
that you want to load on the server. You specify the RSC ID from the
client.

#### Client API

To render a React Server Component on the client, you can use the
`Root` and `Slot` components from `waku/client` with the RSC
ID to create a wrapper component. Here's an example:

```tsx
import { createRoot } from 'react-dom/client';
import { Root, Slot } from 'waku/client';

const rootElement = (
  <StrictMode>
    <Root>
      <Slot id="App" />
    </Root>
  </StrictMode>
);

createRoot(document.getElementById('root')!).render(rootElement);
```

The `initialInput` prop can be passed to the `Root` Component,
overriding the default input which is `""`.
You can also re-render a React Server Component with new input.
Here's an example just to illustrate the idea:

```tsx
import { useRefetch } from 'waku/client';

const Component = () => {
  const refetch = useRefetch();
  const handleClick = () => {
    refetch('...');
  };
  // ...
};
```

#### Additional Server API

In addition to the `renderEntries` function, you can also
optionally specify `getBuildConfig` function in
`entries.ts`. Here's an example:

```tsx
import { defineEntries } from 'waku/server';

export default defineEntries(
  // renderEntries
  async (input) => {
    return {
      App: <App name={input || 'Waku'} />,
    };
  },
  // getBuildConfig
  async () => {
    return {
      '/': {
        entries: [['']],
      },
    };
  },
);
```

The `getBuildConfig` function is used for build-time
optimization. It renders React Server Components during the build
process to produce the output that will be sent to the client. Note
that rendering here means to produce RSC payload not HTML content.

#### How to try it

If you create a project with something like
`npm create waku@latest`, it will create the minimal
example app.

### Router

Waku provides a router built on top of the minimal API, and it serves
as a reference implementation.

#### Client API

To use the router, it is required to use the `Router`
component instead of using `Root` and `Slot` directly.
The following code demonstrates how to use
the `Router` component as the root component:

```tsx
import { createRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

const root = createRoot(document.getElementById('root')!);

root.render(<Router />);
```

The `Router` component internally uses `Root` and `Slot`
and handles nested routes.

#### Server API

In `entries.ts`, we use `defineRouter` to export
`getEntry` and `getBuildConfig` at once.
Here's a simple example code without builder:

```tsx
import { defineRouter } from 'waku/router/server';

export default defineRouter((id) => {
  switch (id) {
    case 'index/page':
      return import('./routes/index.tsx');
    case 'foo/page':
      return import('./routes/foo.tsx');
    default:
      return null;
  }
});
```

The implementation of the `defineRouter` is config-based.
However, it isn't too difficult to make a file-based router.
Here's a file-based example code with builder:

```tsx
import { fileURLtoPath } from 'node:url';
import path from 'node:path';
import { glob } from 'glob';
import { defineRouter } from 'waku/router/server';

const routesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'routes',
);

export default defineRouter(
  // getComponent (id is '**/layout' or '**/page')
  async (id) => {
    const files = await glob(`${id}.{tsx,js}`, { cwd: routesDir });
    if (files.length === 0) {
      return null;
    }
    const items = id.split('/');
    switch (items.length) {
      case 1:
        return import(`./routes/${items[0]}.tsx`);
      case 2:
        return import(`./routes/${items[0]}/${items[1]}.tsx`);
      case 3:
        return import(`./routes/${items[0]}/${items[1]}/${items[2]}.tsx`);
      default:
        throw new Error('too deep route');
    }
  },
  // getPathsForBuild
  async () => {
    const files = await glob('**/page.{tsx,js}', { cwd: routesDir });
    return files.map(
      (file) => '/' + file.slice(0, Math.max(0, file.lastIndexOf('/'))),
    );
  },
);
```

Due to the limitation of bundler, we cannot automatically allow
infinite depth of routes.

#### How to try it

You can try an example app in the repository by cloning it and running
the following commands:

```sh
git clone https://github.com/dai-shi/waku.git
cd waku
pnpm install
npm run examples:dev:07_router
```

Alternatively, you could create a project with something like
`npm create waku@latest` and copy files from the example
folder in the repository.

## Deploy

### Vercel

```sh
vercel
```

Then change the setting as follows (needs redeploy for the first time):

![vercel](https://github.com/dai-shi/waku/assets/490574/6bd317a8-2772-42f4-92d4-b508af7d7460)

### Cloudflare (experimental)

```sh
npm run build -- --with-cloudflare
rm -r node_modules
npm install --omit=dev --omit=peer
npx wrangler dev # or deploy
```

### Deno Deploy (experimental)

```sh
npm run build -- --with-deno
DENO_DEPLOY_TOKEN=... deployctl deploy --project=... --prod serve.ts --exclude node_modules
```

## Tweets

<https://github.com/dai-shi/waku/discussions/150>

## Diagrams

<https://github.com/dai-shi/waku/discussions/151>
