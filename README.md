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
(RSC), a new feature that will be available in a future version of
React. RSC allows developers to render UI components on the server,
improving performance and enabling server-side features. To use RSC,
a framework is necessary for bundling, optionally server, router and
so on.

Waku takes a minimalistic approach, providing a minimal API that
allows for multiple feature implementations and encourages growth in
the ecosystem. For example, the minimal API is not tied to a specific
router. This flexibility makes it easier to build new features.

Waku uses Vite internally, and while it is still a work in progress,
it will eventually support all of Vite's features. It can even
work as a replacement for Vite + React client components. While using
RSC is optional, it is highly recommended for improved user and
developer experiences.

## Why develop a React framework?

We believe that React Server Components (RSC) are the future of React.
The challenge is that we can't utilize RSC with the React library alone.
Instead, they require a React framework for bundling, at the very least.

Currently, only a few React frameworks support RSC, and
they often come with more features than RSC.
It would be nice to have a minimal framework that implements RSC,
which should help learning how RSC works.

Learning is the start, but it's not what we aim at.
Our assumption is that RSC best practices are still to explore.
The minimal implementation should clarify the fundamentals of RSC
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

## API

### Minimal API

The minimal API doesn't provide many capabilities.
It's useful to learn RSC behaviors.
It is good to build SPA too.

Another good reason to have the minimal API is for library authors.
We can develop libraries on top of it to provide more capabilities.

#### Server API

To use React Server Components in Waku, you need to create an
`entries.tsx` file in `src` directry right under the project root directory.
It should default export with a `renderEntries` function.
`defineEntries` helps for type inference.

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

The `renderEntries` returns a set of server components (elements).
The `input` parameter is any URL path embeddable string
that you can specify from the client.

#### Client API

To render a React Server Component on the client, you can use the
`Root` and `Slot` components from `waku/client` with the RSC
ID to create a wrapper component. Here's an example:

```tsx
import { createRoot } from 'react-dom/client';
import { Root, Slot } from 'waku/client';

const rootElement = (
  <StrictMode>
    <Root initialInput="Waku Waku">
      <Slot id="App" />
    </Root>
  </StrictMode>
);

createRoot(document.body).render(rootElement);
```

The `initialInput` prop can be passed to the `Root` Component,
overriding the default input which is `""`.
You can also re-render a React Server Component with new input.

Here's an example incomplete code:

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
`entries.tsx`.

Here's an example:

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
  async () => [{ pathname: '/', entries: [['']] }],
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

### Router API

Unlike Minimal API, Router API is primarily designed for
developing apps with MPA in mind.
Router API is completely developed on Minimal API.

#### Client API

To use the router, it is required to use the `Router`
component instead of using `Root` and `Slot` directly.
The following code demonstrates how to use
the `Router` component as the root component:

```tsx
import { createRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

createRoot(document.body).render(<Router />);
```

The `Router` component internally uses `Root` and `Slot`
and handles nested routes.

#### Server API

There are two kinds of Server API.
The first is `defineRouter`, which is low level.
The second is `createPages`, which is a wrapper around `defineRouter`.
We can use either of them in `entries.tsx`
instead of `defineEntries` with Minimal API.

Here's an incomplete example with `createPages`:

```tsx
import { lazy } from 'react';
import { createPages } from 'waku/router/server';

const Index = lazy(() => import('./components/index.js'));
const Foo = lazy(() => import('./components/foo.js'));

export default createPages(async ({ createPage }) => {
  createPage({ render: 'static', path: '/', component: Index });
  createPage({ render: 'dynamic', path: '/foo', component: Foo });
});
```

For more usage, check out [`07_router` example](./examples/07_router).

`createPages` is a config-based router.
If you want a file-based router,
you could use the low-level `defineRouter`.
However, it's a little bit tricky to implement.
See [`10_dynamicroute` example](./examples/10_dynamicroute)
as a reference implementation.
By the way, it might be a good opportunity for a Waku library author
to provide a file-based router.
(Minimal API can also be used to develop a router with more control.)

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
`npm create waku@latest` and choose "router-template".

## SSR (HTML generation for initial page)

Waku comes with SSR for initial page load performance,
but it's not enabled by default.
That's because learning RSC is easier without SSR,
and SSR might be confusing for app development
(because client components render on server and `window === undefined`).

To enable SSR, we need to use `--with-ssr` option
and provide `getSsrConfig` function in `entries.tsx`.
(Router API already implements `getSsrConfig`.)

## Deploy

### Vercel

```sh
vercel
```

Then change the setting as follows (needs redeploy for the first time):

![vercel](https://github.com/dai-shi/waku/assets/490574/6bd317a8-2772-42f4-92d4-b508af7d7460)

#### SSG

Adding `--with-vercel-static` option to the build script,
will produce static sites without serverless functions.

```json
{
  "scripts": {
    "build": "waku build --with-ssr --with-vercel-static"
  }
}
```

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
