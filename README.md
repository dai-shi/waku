# Waku

⛩️ The minimal React framework

visit [waku.gg](https://waku.gg) or `npm create waku@latest`

[![Build Status](https://img.shields.io/github/actions/workflow/status/dai-shi/waku/ci.yml?branch=main&style=flat&colorA=000000&colorB=000000)](https://github.com/pmndrs/jotai/actions?query=workflow%3ALint)
[![Version](https://img.shields.io/npm/v/waku?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/waku)
[![Downloads](https://img.shields.io/npm/dt/waku.svg?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/waku)
[![Discord Shield](https://img.shields.io/discord/627656437971288081?style=flat&colorA=000000&colorB=000000&label=discord&logo=discord&logoColor=ffffff)](https://discord.gg/MrQdmzd)

<br>

## Introduction

**Waku** _(wah-ku)_ or **わく** means “framework” in Japanese. As the minimal React framework, it’s designed to accelerate the work of developers at startups and agencies building small to medium-sized React projects. These include marketing websites, light ecommerce, and web applications.

We recommend other frameworks for heavy ecommerce or enterprise applications. Waku is a lightweight alternative bringing a fun developer experience to the server components era. Yes, let’s make React development fun again!

> Waku is in rapid development and some features are currently missing. Please try it on non-production projects and report any issues you may encounter. Expect that there will be some breaking changes on the road towards a stable v1 release. Contributors are welcome.

## Getting started

Start a new Waku project with the `create` command for your preferred package manager. It will scaffold a new project with our default [Waku starter](https://github.com/dai-shi/waku/tree/main/examples/01_template).

```
npm create waku@latest
```

**Node.js version requirement:** `^20.8.0` or `^18.17.0`

## Rendering

While there’s a bit of a learning curve to modern React rendering, it introduces powerful new patterns of full-stack composability that are only possible with the advent of [server components](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md).

So please don’t be intimidated by the `'use client'` directive! Once you get the hang of it, you’ll appreciate how awesome it is to flexibly move server-client boundaries with a single line of code as your full-stack React codebase evolves over time. It’s way simpler than maintaining separate codebases for your backend and frontend.

And please don’t fret about client components! Even if you only lightly optimize towards server components, your client bundle size will be smaller than traditional React frameworks, which are always 100% client components.

> Future versions of Waku may provide additional opt-in APIs to abstract some of the complexity away for an improved developer experience.

#### Server components

Server components can be made async and can securely perform server-side logic and data fetching. Feel free to access the local file-system and import heavy dependencies since they aren’t included in the client bundle. They have no state, interactivity, or access to browser APIs since they run _exclusively_ on the server.

```tsx
// server component
import db from 'some-db';

import { Gallery } from '../components/gallery';

export const Store = async () => {
  const products = await db.query('SELECT * FROM products');

  return <Gallery products={products} />;
};
```

#### Client components

A `'use client'` directive placed at the top of a file will create a server-client boundary when imported into a server component. All components imported below the boundary will be hydrated to run in the browser as well. They can use all traditional React features such as state, effects, and event handlers.

```tsx
// client component
'use client';

import { useState } from 'react';

export const Counter = () => {
  const [count, setCount] = useState(0);

  return (
    <>
      <div>Count: {count}</div>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </>
  );
};
```

#### Shared components

Simple React components that [meet all of the rules](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md#sharing-code-between-server-and-client) of both server and client components can be imported into either server or client components without affecting the server-client boundary.

```tsx
// shared component
export const Headline = ({ children }) => {
  return <h3>{children}</h3>;
};
```

#### Weaving patterns

Server components can import client components and doing so will create a server-client boundary. Client components cannot import server components, but they can accept server components as props such as `children`. For example, you may want to add global context providers this way.

```tsx
// ./src/pages/_layout.tsx
import { Providers } from '../components/providers';

export default async function RootLayout({ children }) {
  return (
    <Providers>
      <main>{children}</main>
    </Providers>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
```

```tsx
// ./src/components/providers.tsx
'use client';

import { Provider } from 'jotai';

export const Providers = ({ children }) => {
  return <Provider>{children}</Provider>;
};
```

#### Server-side rendering

Waku provides static prerendering (SSG) and server-side rendering (SSR) options for both layouts and pages including all of their server _and_ client components. Note that SSR is a distinct concept from RSC.

#### tl;dr:

Each layout and page in Waku is composed of a React component hierarchy.

It begins with a server component at the top of the tree. Then at points down the hierarchy, you’ll eventually import a component that needs client component APIs. Mark this file with a `'use client'` directive at the top. When imported into a server component, it will create a server-client boundary. Below this point, all imported components are hydrated and will run in the browser as well.

Server components can be rendered below this boundary, but only via composition (e.g., `children` props). Together they form [a new “React server” layer](https://github.com/reactwg/server-components/discussions/4) that runs _before_ the traditional “React client” layer with which you’re already familiar.

Client components are still server-side rendered as SSR is separate from RSC. Please see the [linked diagrams](https://github.com/reactwg/server-components/discussions/4) for a helpful visual.

#### Further reading

To learn more about the modern React architecture, we recommend [Making Sense of React Server Components](https://www.joshwcomeau.com/react/server-components/) and [The Two Reacts](https://overreacted.io/the-two-reacts/).

## Routing

Waku provides a minimal file-based “pages router” experience built for the server components era.

Its underlying [low-level API](https://github.com/dai-shi/waku/blob/main/docs/create-pages.mdx) is also available for those that prefer programmatic routing. This documentation covers file-based routing since many React developers prefer it, but please feel free to try both and see which you like more!

### Overview

The directory for file-based routing in Waku projects is `./src/pages`.

Layouts and pages can be created by making a new file with two exports: a default function for the React component and a named `getConfig` function that returns a configuration object to specify the render method and other options.

Waku currently supports two rendering options:

- `'static'` for static prerendering (SSG)

- `'dynamic'` for server-side rendering (SSR)

For example, you can statically prerender a global header and footer in the root layout at build time, but dynamically render the rest of a home page at request time for personalized user experiences.

```tsx
// ./src/pages/_layout.tsx
import '../styles.css';

import { Providers } from '../components/providers';
import { Header } from '../components/header';
import { Footer } from '../components/footer';

// Create root layout
export default async function RootLayout({ children }) {
  return (
    <Providers>
      <Header />
      <main>{children}</main>
      <Footer />
    </Providers>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
```

```tsx
// ./src/pages/index.tsx

// Create home page
export default async function HomePage() {
  const data = await getData();

  return (
    <>
      <h1>{data.title}</h1>
      <div>{data.content}</div>
    </>
  );
}

const getData = async () => {
  /* ... */
};

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};
```

### Pages

Pages render a single route, segment route, or catch-all route based on the file system path (conventions below). All page components automatically receive two props related to the rendered route: `path` (string) and `searchParams` ([URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)).

#### Single routes

Pages can be rendered as a single route (e.g., `about.tsx` or `blog/index.tsx`).

```tsx
// ./src/pages/about.tsx

// Create about page
export default async function AboutPage() {
  return <>{/* ...*/}</>;
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
```

```tsx
// ./src/pages/blog/index.tsx

// Create blog index page
export default async function BlogIndexPage() {
  return <>{/* ...*/}</>;
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
```

#### Segment routes

Segment routes (e.g., `[slug].tsx` or `[slug]/index.tsx`) are marked with brackets.

The rendered React component automatically receives a prop named by the segment (e.g., `slug`) with the value of the rendered segment (e.g., `'introducing-waku'`).

If statically prerendering a segment route at build time, a `staticPaths` array must also be provided.

```tsx
// ./src/pages/blog/[slug].tsx

// Create blog article pages
export default async function BlogArticlePage({ slug }) {
  const data = await getData(slug);

  return <>{/* ...*/}</>;
}

const getData = async (slug) => {
  /* ... */
};

export const getConfig = async () => {
  return {
    render: 'static',
    staticPaths: ['introducing-waku', 'introducing-pages-router'],
  };
};
```

```tsx
// ./src/pages/shop/[category].tsx

// Create product category pages
export default async function ProductCategoryPage({ category }) {
  const data = await getData(category);

  return <>{/* ...*/}</>;
}

const getData = async (category) => {
  /* ... */
};

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};
```

Static paths (or other config values) can also be generated programmatically.

```tsx
// ./src/pages/blog/[slug].tsx

// Create blog article pages
export default async function BlogArticlePage({ slug }) {
  const data = await getData(slug);

  return <>{/* ...*/}</>;
}

const getData = async (slug) => {
  /* ... */
};

export const getConfig = async () => {
  const staticPaths = await getStaticPaths();

  return {
    render: 'static',
    staticPaths,
  };
};

const getStaticPaths = async () => {
  /* ... */
};
```

#### Nested segment routes

Routes can contain multiple segments (e.g., `/shop/[category]/[product]`) by creating folders with brackets as well.

```tsx
// ./src/pages/shop/[category]/[product].tsx

// Create product category pages
export default async function ProductDetailPage({ category, product }) {
  return <>{/* ...*/}</>;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};
```

For static prerendering of nested segment routes, the `staticPaths` array is instead composed of ordered arrays.

```tsx
// ./src/pages/shop/[category]/[product].tsx

// Create product detail pages
export default async function ProductDetailPage({ category, product }) {
  return <>{/* ...*/}</>;
}

export const getConfig = async () => {
  return {
    render: 'static',
    staticPaths: [
      ['same-category', 'some-product'],
      ['same-category', 'another-product'],
    ],
  };
};
```

#### Catch-all routes

Catch-all or “wildcard” segment routes (e.g., `/app/[...catchAll]`) are marked with an ellipsis before the name and have indefinite segments.

Wildcard routes receive a prop with segment values as an ordered array. For example, the `/app/profile/settings` route would receive a `catchAll` prop with the value `['profile', 'settings']`. These values can then be used to determine what to render in the component.

```tsx
// ./src/pages/app/[...catchAll].tsx

// Create dashboard page
export default async function DashboardPage({ catchAll }) {
  return <>{/* ...*/}</>;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};
```

### Layouts

Layouts are created with a special `_layout.tsx` file name and wrap the entire route and its descendents. They must accept a `children` prop of type `ReactNode`. While not required, you will typically want at least a root layout.

#### Root layout

The root layout placed at `./pages/_layout.tsx` is especially useful. It can be used for setting global styles, global metadata, global providers, global data, and global components, such as a header and footer.

```tsx
// ./src/pages/_layout.tsx
import '../styles.css';

import { Providers } from '../components/providers';
import { Header } from '../components/header';
import { Footer } from '../components/footer';

// Create root layout
export default async function RootLayout({ children }) {
  return (
    <Providers>
      <link rel="icon" type="image/png" href="/images/favicon.png" />
      <meta property="og:image" content="/images/opengraph.png" />
      <Header />
      <main>{children}</main>
      <Footer />
    </Providers>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
```

```tsx
// ./src/components/providers.tsx
'use client';

import { createStore, Provider } from 'jotai';

const store = createStore();

export const Providers = ({ children }) => {
  return <Provider store={store}>{children}</Provider>;
};
```

#### Other layouts

Layouts are also helpful in nested routes. For example, you can add a layout at `./pages/blog/_layout.tsx` to add a sidebar to both the blog index and all blog article pages.

```tsx
// ./src/pages/blog/_layout.tsx
import { Sidebar } from '../../components/sidebar';

// Create blog layout
export default async function BlogLayout({ children }) {
  return (
    <div className="flex">
      <div>{children}</div>
      <Sidebar />
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
```

## Navigation

### Link

The`<Link />` component should be used for internal links. It accepts a `to` prop for the destination, which is automatically prefetched ahead of the navigation.

```tsx
// ./src/pages/index.tsx
import { Link } from 'waku';

export default async function HomePage() {
  return (
    <>
      <h1>Home</h1>
      <Link to="/about">About</Link>
    </>
  );
}
```

### useRouter

The `useRouter` hook can be used to inspect the current route or perform programmatic navigation.

#### router properties

The `router` object has two properties related to the current route: `path` (string) and `searchParams` ([URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)).

```tsx
'use client';

import { useRouter_UNSTABLE as useRouter } from 'waku';

export const Component = () => {
  const { path, searchParams } = useRouter();

  return (
    <>
      <div>current path: {path}</div>
      <div>current searchParams: {searchParams.toString()}</div>
    </>
  );
};
```

#### router methods

The `router` object also contains several methods for programmatic navigation:

- `router.push(to: string)` - navigate to the provided route

- `router.prefetch(to: string)` - prefetch the provided route

- `router.replace(to: string)` - replace the current history entry

- `router.reload()` - reload the current route

- `router.back()` - navigate to the previous entry in the session history

- `router.forward()` - navigate to the next entry in the session history

```tsx
'use client';

import { useRouter_UNSTABLE as useRouter } from 'waku';

export const Component = () => {
  const router = useRouter();

  return (
    <>
      <button onClick={() => router.push('/')}>Home</button>
      <button onClick={() => router.back()}>Back</button>
    </>
  );
};
```

## Metadata

Waku automatically hoists any title, meta, and link tags to the document head. That means adding meta tags is as simple as adding them to any of your layout or page components.

```tsx
// ./src/pages/_layout.tsx
export default async function RootLayout({ children }) {
  return (
    <>
      <link rel="icon" type="image/png" href="/images/favicon.png" />
      <meta property="og:image" content="/images/opengraph.png" />
      {children}
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
```

```tsx
// ./src/pages/index.tsx
export default async function HomePage() {
  return (
    <>
      <title>Waku</title>
      <meta property="description" content="The minimal React framework" />
      <h1>Waku</h1>
      <div>Hello world!</div>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
```

Metadata can also be generated programmatically.

```tsx
// ./src/pages/index.tsx
export default async function HomePage() {
  return (
    <>
      <Head />
      <div>{/* ...*/}</div>
    </>
  );
}

const Head = async () => {
  const metadata = await getMetadata();

  return (
    <>
      <title>{metadata.title}</title>
      <meta property="description" content={metadata.description} />
    </>
  );
};

const getMetadata = async () => {
  /* ... */
};

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
```

## Styling

### Global styles

Install any required dev dependencies (e.g., `npm i -D tailwindcss autoprefixer`) and set up any required configuration (e.g., `postcss.config.js`). Then create your global stylesheet (e.g., `./src/styles.css`) and import it into the root layout.

```tsx
// ./src/pages/_layout.tsx
import '../styles.css';

export default async function RootLayout({ children }) {
  return <>{children}</>;
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
```

```css
/* ./src/styles.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```js
// ./tailwind.config.js
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
};
```

```js
// ./postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

## Static assets

Static assets such as images, fonts, stylesheets, and scripts can be placed in a special `./public` folder of the Waku project root directory. The public directory structure is served relative to the `/` base path.

```tsx
// assuming image is saved at `/public/images/logo.svg`

export const Logo = () => {
  return (
    <>
      <img src="/images/logo.svg" />
    </>
  );
};
```

## File system

Files placed in a special `./private` folder of the Waku project root directory can be securely accessed in React server components.

```tsx
export default async function HomePage() {
  const file = readFileSync('./private/README.md', 'utf8');

  return <>{/* ...*/}</>;
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
```

## Data fetching

### Server

All of the wonderful patterns enabled by React server components are supported. For example, you can compile MDX files or perform code syntax highlighting on the server with zero impact on the client bundle size.

```tsx
// ./src/pages/blog/[slug].tsx
import { MDX } from '../../components/mdx';
import { getArticle, getStaticPaths } from '../../lib/blog';

export default async function BlogArticlePage({ slug }) {
  const article = await getArticle(slug);

  return (
    <>
      <title>{article.frontmatter.title}</title>
      <h1>{article.frontmatter.title}</h1>
      <MDX>{article.content}</MDX>
    </>
  );
}

export const getConfig = async () => {
  const staticPaths = await getStaticPaths();

  return {
    render: 'static',
    staticPaths,
  };
};
```

### Client

Data should be fetched on the server when possible for the best user experience, but all data fetching libraries such as React Query are compatible with Waku.

## State management

We recommend [Jotai](https://jotai.org) for global React state management based on the atomic model’s performance and scalability, but Waku is compatible with all React state management libraries such as Zustand and Valtio.

> We’re exploring a deeper integration of atomic state management into Waku to achieve the performance and developer experience of signals while preserving React’s declarative programming model.

## Environment variables

It’s important to distinguish environment variables that must be kept secret from those that can be made public.

#### Private

By default all environment variables are considered private and are accessible only in server components, which can be rendered exclusively in a secure environment. You must still take care not to inadvertently pass the variable as props to any client components.

#### Public

A special `WAKU_PUBLIC_` prefix is required to make an environment variable public and accessible in client components. They will be present as cleartext in the production JavaScript bundle sent to users’ browsers.

### Runtime agnostic (recommended)

Environment variables are available on the server via the Waku `getEnv` function and on the client via `import.meta.env`.

```tsx
// server components can access both private and public variables
import { getEnv } from 'waku';

export const ServerComponent = async () => {
  const secretKey = getEnv('SECRET_KEY');

  return <>{/* ...*/}</>;
};
```

```tsx
// client components can only access public variables
'use client';

export const ClientComponent = () => {
  const publicStatement = import.meta.env.WAKU_PUBLIC_HELLO;

  return <>{/* ...*/}</>;
};
```

### Node.js

In Node.js environments, `process.env` may be used for compatibility.

```tsx
// server components can access both private and public variables
export const ServerComponent = async () => {
  const secretKey = process.env.SECRET_KEY;

  return <>{/* ...*/}</>;
};
```

```tsx
// client components can only access public variables
'use client';

export const ClientComponent = () => {
  const publicStatement = process.env.WAKU_PUBLIC_HELLO;

  return <>{/* ...*/}</>;
};
```

## Deployment

### Vercel

Waku projects can be deployed to Vercel with the [Vercel CLI](https://vercel.com/docs/cli) automatically.

```
vercel
```

#### Pure SSG

Adding the `--with-vercel-static` flag to the build script will produce static sites without serverless functions.

```
{
  "scripts": {
    "build": "waku build --with-vercel-static"
  }
}
```

### Netlify

Waku projects can be deployed to Netlify with the [Netlify CLI](https://docs.netlify.com/cli/get-started/).

```
npm run build -- --with-netlify
netlify deploy
```

#### Pure SSG

Adding the `--with-netlify-static` flag to the build script will produce static sites without Netlify functions.

```
{
  "scripts": {
    "build": "waku build --with-netlify-static"
  }
}
```

### Cloudflare (experimental)

```
npm run build -- --with-cloudflare
npx wrangler dev # or deploy
```

### PartyKit (experimental)

```
npm run build -- --with-partykit
npx partykit dev # or deploy
```

### Deno Deploy (experimental)

```
npm run build -- --with-deno
DENO_DEPLOY_TOKEN=... deployctl deploy --project=... --prod dist/serve.js --exclude node_modules
```

### AWS Lambda (experimental)

```
npm run build -- --with-aws-lambda
```

The handler entrypoint is `dist/serve.js`: see [Hono AWS Lambda Deploy Docs](https://hono.dev/getting-started/aws-lambda#_3-deploy).

## Community

Please join our friendly [GitHub discussions](https://github.com/dai-shi/waku/discussions) or [Discord server](https://discord.gg/MrQdmzd) to participate in the Waku community. Hope to see you there!

## Roadmap

Waku is in active development and we’re seeking additional contributors. Check out our [roadmap](https://github.com/dai-shi/waku/issues/24) for more information.
