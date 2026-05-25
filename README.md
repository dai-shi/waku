# Waku

⛩️ The minimal React framework

visit [waku.gg](https://waku.gg) or `npm create waku@latest`

[![Build Status](https://img.shields.io/github/actions/workflow/status/wakujs/waku/test.yml?branch=main&style=flat&colorA=000000&colorB=000000)](https://github.com/wakujs/waku/actions?query=workflow%3ATest)
[![Version](https://img.shields.io/npm/v/waku?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/waku)
[![Downloads](https://img.shields.io/npm/dt/waku.svg?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/waku)
[![Discord Shield](https://img.shields.io/discord/627656437971288081?style=flat&colorA=000000&colorB=000000&label=discord&logo=discord&logoColor=ffffff)](https://discord.gg/MrQdmzd)

<br>

## Introduction

**Waku** _(wah-ku)_ or **わく** is the minimal React framework. It’s lightweight and designed for a fun developer experience, yet supports all the latest React 19 features like server components and actions. Built for marketing sites, headless commerce, and web apps. For large enterprise applications, you may prefer a heavier framework.

## Getting started

Start a new Waku project with the `create` command for your preferred package manager. It will scaffold a new project with our default [Waku starter](https://github.com/wakujs/waku/tree/main/examples/01_template).

```sh
npm create waku@latest
```

#### Commands

- `waku dev` to start the local development server
- `waku build` to generate a production build
- `waku start` to serve the production build locally

**Node.js version requirement:** `^26.0.0` or `^24.0.0` or `^22.12.0`

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
  } as const;
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

Its underlying [low-level API](https://github.com/wakujs/waku/blob/main/docs/create-pages.mdx) is also available for those that prefer programmatic routing. This documentation covers file-based routing since many React developers prefer it, but please feel free to try both and see which you like more!

### Overview

The directory for file-based routing in Waku projects is `./src/pages`.

Layouts and pages can be created by making a new file with two exports: a default function for the React component and a named `getConfig` function that returns a configuration object to specify the render method and other options.

Waku currently supports two rendering options:

- `'static'` for static prerendering (SSG)

- `'dynamic'` for server-side rendering (SSR)

Layouts, pages, and slices are all `static` by default, while api handlers default to `dynamic`.

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
  } as const;
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
  } as const;
};
```

### Pages

Pages render a single route, segment route, or catch-all route based on the file system path (conventions below). All page components automatically receive two props related to the rendered route: `path` (string) and `query` (string).

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
  } as const;
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
  } as const;
};
```

#### Segment routes

Segment routes (e.g., `[slug].tsx` or `[slug]/index.tsx`) are marked with brackets.

The rendered React component automatically receives a prop named by the segment (e.g., `slug`) with the value of the rendered segment (e.g., `'introducing-waku'`).

If statically prerendering a segment route at build time, a `staticPaths` array must also be provided.

```tsx
// ./src/pages/blog/[slug].tsx
import type { PageProps } from 'waku/router';

// Create blog article pages
export default async function BlogArticlePage({
  slug,
}: PageProps<'/blog/[slug]'>) {
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
  } as const;
};
```

```tsx
// ./src/pages/shop/[category].tsx
import type { PageProps } from 'waku/router';

// Create product category pages
export default async function ProductCategoryPage({
  category,
}: PageProps<'/shop/[category]'>) {
  const data = await getData(category);

  return <>{/* ...*/}</>;
}

const getData = async (category) => {
  /* ... */
};

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
```

Static paths (or other config values) can also be generated programmatically.

```tsx
// ./src/pages/blog/[slug].tsx
import type { PageProps } from 'waku/router';

// Create blog article pages
export default async function BlogArticlePage({
  slug,
}: PageProps<'/blog/[slug]'>) {
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
  } as const;
};

const getStaticPaths = async () => {
  /* ... */
};
```

#### Nested segment routes

Routes can contain multiple segments (e.g., `/shop/[category]/[product]`) by creating folders with brackets as well.

```tsx
// ./src/pages/shop/[category]/[product].tsx
import type { PageProps } from 'waku/router';

// Create product category pages
export default async function ProductDetailPage({
  category,
  product,
}: PageProps<'/shop/[category]/[product]'>) {
  return <>{/* ...*/}</>;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
```

For static prerendering of nested segment routes, the `staticPaths` array is instead composed of ordered arrays.

```tsx
// ./src/pages/shop/[category]/[product].tsx
import type { PageProps } from 'waku/router';

// Create product detail pages
export default async function ProductDetailPage({
  category,
  product,
}: PageProps<'/shop/[category]/[product]'>) {
  return <>{/* ...*/}</>;
}

export const getConfig = async () => {
  return {
    render: 'static',
    staticPaths: [
      ['same-category', 'some-product'],
      ['same-category', 'another-product'],
    ],
  } as const;
};
```

#### Catch-all routes

Catch-all or “wildcard” segment routes (e.g., `/app/[...catchAll]`) are marked with an ellipsis before the name and have indefinite segments.

Wildcard routes receive a prop with segment values as an ordered array. For example, the `/app/profile/settings` route would receive a `catchAll` prop with the value `['profile', 'settings']`. These values can then be used to determine what to render in the component.

```tsx
// ./src/pages/app/[...catchAll].tsx
import type { PageProps } from 'waku/router';

// Create dashboard page
export default async function DashboardPage({
  catchAll,
}: PageProps<'/app/[...catchAll]'>) {
  return <>{/* ...*/}</>;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
```

#### Group routes

Group routes allow you to organize routes into logical groups without affecting the URL structure. They're created by wrapping directory names in parentheses (e.g., `(group)`). This is particularly useful for sharing layouts across multiple routes while keeping the URL clean.

For example, you might want a home page at `/` that doesn't use a shared layout, but all other routes should share a common layout. This can be achieved by grouping those routes:

```
├── (main)
│ ├── _layout.tsx
│ ├── about.tsx
│ └── contact.tsx
└── index.tsx
```

In this structure, `/about` and `/contact` will use the layout from `(main)/_layout.tsx`, but `/` (from `index.tsx`) will not.

```tsx
// ./src/pages/(main)/_layout.tsx
import { Header } from '../../components/header';
import { Footer } from '../../components/footer';

// Create shared layout for main pages
export default async function MainLayout({ children }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
```

```tsx
// ./src/pages/(main)/about.tsx
export default async function AboutPage() {
  return <h1>About Us</h1>;
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
```

Group routes can be nested to create complex layout compositions. For instance, you could have a static layout at the group level and a dynamic layout nested within:

```
(main)
├── (dynamic)
│ ├── _layout.tsx # dynamic layout
│ ├── dashboard.tsx
│ └── profile.tsx
└── _layout.tsx # static layout
```

This allows for fine-grained control over rendering modes - some work can be done at build time (`static`) while other work happens at runtime (`dynamic`).

```tsx
// ./src/pages/(main)/_layout.tsx
// Static layout - runs at build time
export default async function MainLayout({ children }) {
  return <div className="main-container">{children}</div>;
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
```

```tsx
// ./src/pages/(main)/(dynamic)/_layout.tsx
// Dynamic layout - runs at request time
export default async function DynamicLayout({ children }) {
  const userData = await fetchUserData(); // Dynamic data fetching

  return (
    <div className="dynamic-container">
      <UserContext.Provider value={userData}>{children}</UserContext.Provider>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
```

Group routes are especially powerful for organizing complex applications where different sections need different layouts, state management, or data requirements while maintaining clean URLs.

#### Ignored routes

The following directories are ignored by the router:

- `_components`
- `_hooks`

All files inside these directories are excluded from routing.

For instance, in the case below, `pages/about.tsx` is routed to `/about`, but files like `_components/header.tsx` are not routed anywhere.

```
pages/
├── about.tsx
├── _components/
│   ├── header.tsx   // 👈🏼 ignored
│   ├── footer.tsx   // 👈🏼 ignored
│   ├── ...          // 👈🏼 ignored
```

### Router paths type safety

Import `PageProps` from `waku/router` for type-safe access to route parameters (as shown in the examples above). The type provides `path`, `query`, and all segment parameters:

```ts
PageProps<'/blog/[slug]'>;
// => { path: string; slug: string; query: string }

PageProps<'/shop/[category]/[product]'>;
// => { path: string; category: string; product: string; query: string }
```

### Layouts

Layouts are created with a special `_layout.tsx` file name and wrap the entire route and its descendants. They must accept a `children` prop of type `ReactNode`. While not required, you will typically want at least a root layout.

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
  } as const;
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
  } as const;
};
```

### Root element

The attributes of `<html>`, `<head>`, or `<body>` elements can be customized with the root element API. Create a special `_root.tsx` file in the `./src/pages` directory that accepts a `children` prop of type `ReactNode`.

```tsx
// ./src/pages/_root.tsx

// Create root element
export default async function RootElement({ children }) {
  return (
    <html lang="en">
      <head></head>
      <body data-version="1.0">{children}</body>
    </html>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
```

### Slices

Slices are reusable components that are defined in the `src/pages/_slices` directory. They allow you to compose pages by assembling components like normal React components while specifying alternate rendering patterns.

#### Creating slices

Slices are created by placing files in the `src/pages/_slices` directory. The slice ID corresponds to the filename, and nested slices use the full path as the ID.

```
 src/pages
 ├── _slices
 │   ├── one.tsx
 │   ├── two.tsx
 │   └── nested
 │       └── three.tsx
 └── some-page.tsx
```

Each slice file exports a default React component and a `getConfig` function that specifies the render method.

```tsx
// ./src/pages/_slices/one.tsx

// Create slice component
export default function SliceOne() {
  return <p>🍕</p>;
}

export const getConfig = () => {
  return {
    render: 'static', // default is 'static'
  };
};
```

```tsx
// ./src/pages/_slices/nested/three.tsx

// Create nested slice component
export default function SliceThree() {
  return <p>🍰</p>;
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  };
};
```

#### Using slices

Slices are used in pages and layouts by importing the `Slice` component from Waku and specifying the slice ID. The `slices` array in the page's `getConfig` must include all slice IDs used on that page.

```tsx
// ./src/pages/some-page.tsx
import { Slice } from 'waku';

// Create page with slices
export default function SomePage() {
  return (
    <div>
      <Slice id="one" />
      <Slice id="two" />
      <Slice id="nested/three" />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'static',
    slices: ['one', 'two', 'nested/three'],
  };
};
```

#### Lazy slices

Lazy slices allow components to be requested independently from the page they are used on, similar to Astro's server islands feature. This is useful for components that will be dynamically rendered on otherwise static pages.

Lazy slices are marked with the `lazy` prop and can include a `fallback` component to display while loading.

```tsx
// ./src/pages/some-page.tsx
import { Slice } from 'waku';

// Create page with lazy slice
export default function SomePage() {
  return (
    <div>
      <Slice id="one" />
      <Slice id="two" lazy fallback={<p>Two is loading...</p>} />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'static',
    slices: ['one'], // Note: 'two' is lazy, so it is not included
  };
};
```

This allows you to have a `dynamic` slice component while keeping the rest of the page static.

## Navigation

### Link

The `<Link />` component should be used for internal links. It accepts a `to` prop for the destination and handles client-side navigation through Waku's router.

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

The `router` object has two properties related to the current route: `path` (string) and `query` (string).

```tsx
'use client';

import { useRouter } from 'waku';

export const Component = () => {
  const { path, query } = useRouter();

  return (
    <>
      <div>current path: {path}</div>
      <div>current query: {query}</div>
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

import { useRouter } from 'waku';

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

## Error handling

Waku sets up a default error boundary at the root of your application. You can customize error handling by adding your own error boundaries anywhere, for example with the [`react-error-boundary`](https://www.npmjs.com/package/react-error-boundary) library.

When errors are thrown from server components or server functions, the errors are automatically replayed on browser. This allows the closest error boundaries to catch and handle these errors, even though they originated on the server.

```tsx
// ./src/pages/index.tsx
import { ErrorBoundary } from 'react-error-boundary';

export default async function HomePage() {
  return (
    <>
      <ErrorBoundary fallback={<div>Caught server component error!</div>}>
        <ThrowComponent />
      </ErrorBoundary>
      <ErrorBoundary fallback={<div>Caught server function error!</div>}>
        <form
          action={async () => {
            'use server';
            throw new Error('Oops!');
          }}
        >
          <button>Crash</button>
        </form>
      </ErrorBoundary>
    </>
  );
}

const ThrowComponent = async () => {
  throw new Error('Oops!');
  return <>...</>;
};
```

Error boundaries handle **unexpected errors** as a last resort safety net. For expected error conditions (like validation or network failures), handle them explicitly in your application logic.

In production, server errors are automatically obfuscated on the client to avoid revealing server internals. Detailed error messages and stack traces are only visible in development.

If you customize the root element (see [Root element](#root-element)), you should add your own error boundary there, as Waku's default root error boundary is included in the default root element.

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
  } as const;
};
```

```tsx
// ./src/pages/index.tsx
export default async function HomePage() {
  return (
    <>
      <title>Waku</title>
      <meta name="description" content="The minimal React framework" />
      <h1>Waku</h1>
      <div>Hello world!</div>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
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
      <meta name="description" content={metadata.description} />
    </>
  );
};

const getMetadata = async () => {
  /* ... */
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
```

## Styling

### Global styles

Install any required dev dependencies (e.g., `npm i -D tailwindcss @tailwindcss/vite`) and set up any required configuration (e.g., `waku.config.ts`). Then create your global stylesheet (e.g., `./src/styles.css`) and import it into the root layout.

```tsx
// ./src/pages/_layout.tsx
import '../styles.css';

export default async function RootLayout({ children }) {
  return <>{children}</>;
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
```

```css
/* ./src/styles.css */
@import 'tailwindcss';
```

```js
// ./waku.config.ts
import { defineConfig } from 'waku/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
});
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
  } as const;
};
```

## Middleware

In the default Waku setup, files in `./src/middleware` are automatically loaded as [Hono middleware](https://hono.dev/docs/guides/middleware). Each file should default export a function that returns a `MiddlewareHandler`.

```ts
// ./src/middleware/logger.ts
import type { MiddlewareHandler } from 'hono';

const logger = (): MiddlewareHandler => {
  return async (c, next) => {
    console.log(c.req.method, c.req.path);
    await next();
  };
};

export default logger;
```

If you provide a custom `./src/waku.server.tsx`, pass middleware through the adapter options with `middlewareModules` or `middlewareFns`.

## Data fetching

### Server

All of the wonderful patterns enabled by React server components are supported. For example, you can compile MDX files or perform code syntax highlighting on the server with zero impact on the client bundle size.

```tsx
// ./src/pages/blog/[slug].tsx
import type { PageProps } from 'waku/router';

import { MDX } from '../../components/mdx';
import { getArticle, getStaticPaths } from '../../lib/blog';

export default async function BlogArticlePage({
  slug,
}: PageProps<'/blog/[slug]'>) {
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
  } as const;
};
```

### Client

Data should be fetched on the server when possible for the best user experience, but all data fetching libraries such as React Query are compatible with Waku.

## Mutations

Data mutations can be performed via [server actions](https://react.dev/reference/rsc/server-actions) or API endpoints.

### API endpoints

Create API routes by making a new file in the special `./src/pages/_api` directory and exporting one or more functions named after the HTTP methods that you want it to support: `GET`, `HEAD`, `POST`, `PUT`, `DELETE`, `CONNECT`, `OPTIONS`, `TRACE`, or `PATCH`. The name of the file determines the route it will be served from. Each function receives a standard [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) object and returns a standard [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) object.

```ts
// ./src/pages/_api/contact.ts
import emailClient from 'some-email';

const client = new emailClient(process.env.EMAIL_API_TOKEN!);

export const POST = async (request: Request): Promise<Response> => {
  const body = await request.json();

  if (!body.message) {
    return Response.json({ message: 'Invalid' }, { status: 400 });
  }

  try {
    await client.sendEmail({
      From: 'noreply@example.com',
      To: 'someone@example.com',
      Subject: 'Contact form submission',
      Body: body.message,
    });

    return Response.json({ message: 'Success' }, { status: 200 });
  } catch (error) {
    return Response.json({ message: 'Failure' }, { status: 500 });
  }
};
```

Alternatively, you may export a default function as a "catch-all" handler that responds to all request methods.

```ts
// ./src/pages/_api/other-endpoint.ts
export default function handler(request: Request): Response {
  return Response.json(
    { message: 'Default handler ' + request.method },
    { status: 200 },
  );
}
```

#### Typed route parameters

For API routes with dynamic segments (e.g., `./src/pages/_api/users/[id].ts`), you can use `ApiContext` as the second parameter to get typed access to route parameters. The `params` property will be automatically typed based on the path pattern.

```ts
// ./src/pages/_api/users/[id].ts
import type { ApiContext } from 'waku/router';

export async function GET(
  _req: Request,
  { params }: ApiContext<'/users/[id]'>,
) {
  const { id } = params; // id is typed as string
  return Response.json({ id, message: `Hello user ${id}` });
}
```

This also works with multiple parameters and wildcard routes:

```ts
// ./src/pages/_api/files/[...path].ts
import type { ApiContext } from 'waku/router';

export async function GET(
  _req: Request,
  { params }: ApiContext<'/files/[...path]'>,
) {
  const { path } = params; // path is typed as string[]
  return Response.json({ segments: path });
}
```

#### Calling API routes

API routes are accessible at paths with the `_api` prefix stripped. For example a file at `./src/pages/_api/contact.ts` is available at `/contact`, and `./src/pages/_api/blog/rss.xml.ts` is available at `/blog/rss.xml`. You can call these endpoints from your client components using the standard [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) method.

```tsx
'use client';

import { useState } from 'react';

export const ContactForm = () => {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus('sending');

    try {
      const response = await fetch('/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (response.status === 200) {
        setStatus('success');
        setMessage('');
      } else {
        setStatus('error');
        console.error('Error:', data.message);
      }
    } catch (error) {
      setStatus('error');
      console.error('Error:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Your message..."
        required
      />
      <button type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending...' : 'Send Message'}
      </button>
      {status === 'success' && <p>Message sent!</p>}
      {status === 'error' && <p>Failed. Please try again.</p>}
    </form>
  );
};
```

#### Configuring API routes

API routes are dynamic by default, but if you’re using them to create a static resource such as an XML document, you can export a `getConfig` function that returns a config object with the render property set to `'static'`.

```ts
// ./src/pages/_api/blog/rss.xml.ts

export const GET = async () => {
  const rss = generateRSSFeed(); // your RSS generation logic

  return new Response(rss, {
    headers: { 'Content-Type': 'application/rss+xml' },
  });
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
```

### Server actions

Server actions allow you to define and securely execute server-side logic directly from your React components without the need for manually setting up API endpoints, sending `POST` requests to them with `fetch`, or managing pending states and errors.

#### Defining and protecting actions

The `'use server'` directive marks an async function as a server action. Waku automatically creates a reference to the action that can be passed as props or imported into client components, which can then call the referenced function.

When the directive is placed at the top of a function body, it will mark that specific function as an action. Alternatively, the directive can be placed at the top of a file, which will mark _all_ exported functions as actions at once.

Be careful not to add the directive where inappropriate and inadvertently create unwanted endpoints. Endpoints created by server actions are _not_ secured unless you add your own authentication and authorization logic inside the function body.

> The `'use server'` directive has no relation to the`'use client'` directive. It does **not** mark a component as a server component and should **not** be placed at the top of server components!

#### Making and consuming actions

When creating an inline server action within a server component, it can be passed as props to a client component.

```tsx
// ./src/pages/contact.tsx

import db from 'some-db';

export default async function ContactPage() {
  const sendMessage = async (message: string) => {
    'use server';
    await db.messages.create(message);
  };

  return <ContactForm sendMessage={sendMessage} />;
}
```

```tsx
// ./src/components/contact-form.tsx
'use client';

import { useState } from 'react';

export const ContactForm = ({ sendMessage }) => {
  const [message, setMessage] = useState('');

  return (
    <>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={4}
      />
      <button onClick={() => sendMessage(message)}>Send message</button>
    </>
  );
};
```

When creating server actions in a separate file, they can be imported directly into client components.

> When using a top-level `'use server'` directive, note that _all_ exported functions will be made into API endpoints. So be careful only to export functions intended for this purpose. Add server-side logic to validate proper authentication and authorization if appropriate.

```tsx
// ./src/actions/send-message.ts
'use server';

import db from 'some-db';

export async function sendMessage(message: string) {
  await db.messages.create(message);
}
```

```tsx
// ./src/components/contact-button.tsx
'use client';

import { sendMessage } from '../actions/send-message';

export const ContactButton = () => {
  const message = `Hello world!`;

  return <button onClick={() => sendMessage(message)}>Send message</button>;
};
```

#### Invoking actions

Actions can be invoked via event handlers such as `onClick` or `onSubmit`, as in the examples above, or in a `useEffect` hook, based on whichever conditions you choose.

They can also be invoked via an `action` prop on native `<form>` elements. In this case the server action will automatically receive a parameter of `FormData` with all of the form field values, including hidden ones.

```tsx
// ./src/actions/send-message.ts
'use server';

import db from 'some-db';

export async function sendMessage(formData: FormData) {
  const message = formData.get('message');

  await db.messages.create(message);
}
```

```tsx
// ./src/components/create-todo-button.tsx
'use client';

import { sendMessage } from '../actions/send-message';

export const ContactForm = () => {
  return (
    <form action={sendMessage}>
      <textarea name="message" rows={4} />
      <input type="hidden" name="secret-message" value="This too!" />
      <button type="submit">Send message</button>
    </form>
  );
};
```

If you must pass additional arguments to a form action beyond its native form fields, you can use the `bind` method to create an extended server action with the extra arguments.

```tsx
// ./src/components/create-todo-button.tsx
'use client';

import { sendMessage } from '../actions/send-message';

export const ContactForm = ({ author = 'guest' }) => {
  const sendMessageWithAuthor = sendMessage.bind(null, author);

  return (
    <form action={sendMessageWithAuthor}>
      <textarea name="message" rows={4} />
      <button type="submit">Send message</button>
    </form>
  );
};
```

#### Enhancing actions

Server actions integrate with many other React APIs such as the [`useTransition`](https://react.dev/reference/react/useTransition) hook for handling pending states, the [`useActionState`](https://react.dev/reference/react/useActionState) hook for accessing returned values, and the [`useOptimistic`](https://react.dev/reference/react/useOptimistic) hook for performing optimistic UI updates.

See the talk [What’s new in React 19?](https://www.youtube.com/watch?v=AJOGzVygGcY) to learn more.

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

In Node.js environments, `process.env` may also be used.

## Deployment

### Node.js (default)

After building, `waku start` runs the production server.

If you need a standalone app (for example, for Docker),
the build output lives in `dist`. It is the only folder you need to copy, then run `node dist/serve-node.js`.

### Pure SSG

The build output for SSG lives in `dist/public`. You can copy (or upload to any hosting service) the `dist/public` folder.
With Pure SSG, dynamic features (like dynamic rendering, server actions, API routes) do not work.

### Vercel

Waku projects can be deployed to Vercel with the [Vercel CLI](https://vercel.com/docs/cli) automatically.

```sh
vercel
```

#### Pure SSG with Vercel

For advanced users who want to avoid deploying functions, use the server entry file with the Vercel adapter and specify the `static` option.

`./src/waku.server.tsx`:

```ts
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/vercel';

export default adapter(fsRouter(import.meta.glob('./pages/**/*.{tsx,ts}')), {
  static: true,
});
```

### Netlify

Waku projects can be deployed to Netlify with the [Netlify CLI](https://docs.netlify.com/cli/get-started/).

```sh
NETLIFY=1 npm run build
netlify deploy
```

#### Pure SSG with Netlify

For advanced users who want to avoid deploying functions, use the server entry file with the Netlify adapter and specify the `static` option.

`./src/waku.server.tsx`:

```ts
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/netlify';

export default adapter(fsRouter(import.meta.glob('./pages/**/*.{tsx,ts}')), {
  static: true,
});
```

### Cloudflare Workers

Waku projects can be deployed to Cloudflare Workers with [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

```sh
CLOUDFLARE=1 npm run build
wrangler deploy
```

#### Pure SSG with Cloudflare Workers

`./src/waku.server.tsx`:

```ts
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/cloudflare';

export default adapter(fsRouter(import.meta.glob('./pages/**/*.{tsx,ts}')), {
  static: true,
});
```

### Deno Deploy (experimental)

`./src/waku.server.tsx`:

```ts
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/deno';

export default adapter(fsRouter(import.meta.glob('./pages/**/*.{tsx,ts}')));
```

```sh
npm run build
deployctl deploy --prod dist/serve-deno.js --exclude node_modules
```

### Bun (experimental)

`./src/waku.server.tsx`:

```ts
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/bun';

export default adapter(fsRouter(import.meta.glob('./pages/**/*.{tsx,ts}')));
```

```sh
npm run build
```

### AWS Lambda (experimental)

`./src/waku.server.tsx`:

```ts
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/aws-lambda';

export default adapter(
  fsRouter(import.meta.glob('./pages/**/*.{tsx,ts}')),
  { streaming: false }, // optional, default is false
);
```

```sh
npm run build
```

The handler entrypoint is `dist/serve-aws-lambda.js`: see [Hono AWS Lambda Deploy Docs](https://hono.dev/getting-started/aws-lambda#_3-deploy).

### Edge

`waku/adapters/edge` adapter provides a minimal server output without deployment target specific code. For example, you can use it with [Nitro](https://nitro.build/) to handle packaging for various deployment platforms. See [waku-nitro-example](https://github.com/hi-ogawa/waku-nitro-example) for the example.

```ts
// [waku.config.ts]
import { defineConfig } from 'waku/config';

export default defineConfig({
  unstable_adapter: 'waku/adapters/edge',
});
```

## Community

Please join our friendly [GitHub discussions](https://github.com/wakujs/waku/discussions) or [Discord server](https://discord.gg/MrQdmzd) to participate in the Waku community. Hope to see you there!

## Roadmap

Waku is in active development and we’re seeking additional contributors. Check out our [roadmap](https://github.com/wakujs/waku/issues/24) for more information.

## Contributing

If you would like to contribute, please see [CONTRIBUTING.md](https://github.com/wakujs/waku/blob/main/CONTRIBUTING.md)!
