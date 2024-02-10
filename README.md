# Waku

⛩️ The minimal React framework

visit [waku.gg](https://waku.gg) or `npm create waku@latest`

[![Build Status](https://img.shields.io/github/actions/workflow/status/dai-shi/waku/ci.yml?branch=main&style=flat&colorA=000000&colorB=000000)](https://github.com/pmndrs/jotai/actions?query=workflow%3ALint)
[![Version](https://img.shields.io/npm/v/waku?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/waku)
[![Downloads](https://img.shields.io/npm/dt/waku.svg?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/waku)
[![Discord Shield](https://img.shields.io/discord/627656437971288081?style=flat&colorA=000000&colorB=000000&label=discord&logo=discord&logoColor=ffffff)](https://discord.gg/MrQdmzd)

<br>

## Introduction

**Waku** _(wah-ku)_ or **わく** means “framework” in Japanese. As the minimal React framework, it aims to accelerate the work of developers at startups and agencies building small to medium-sized React projects. These include marketing websites, light ecommerce, and web applications.

We recommend other frameworks for heavy ecommerce or enterprise applications. Waku is a lightweight alternative designed to bring a fun developer experience to the modern React server components era. Yes, let’s make React development fun!

> Waku is in rapid development and some features are currently missing. Please try it on non-production projects and report any issues you may encounter. Expect that there will be some breaking changes on the road towards a stable v1 release. Contributors are welcome.

## Getting started

Start a new Waku project with the `create` command for your preferred package manager. It will scaffold a new project with our default [Waku starter](https://github.com/dai-shi/waku/tree/main/examples/01_template).

```
npm create waku@latest
```

**Node.js version requirement:** `^20.8.0 || ^18.16.0`

## Rendering

While there's a bit of a learning curve to modern React rendering, it introduces powerful new patterns of composability that are only possible with the advent of React [server components](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md).

So please don't be intimidated by the `'use client'` directive! Once you get the hang of it, you'll appreciate how awesome it is to flexibly move server-client boundaries with a single line of code as your full-stack React codebase evolves over time.

And please don't fret about client components! Even if you only lightly optimize towards server components, your client bundle size will be smaller than traditional React frameworks, which are 100% client components.

> Future versions of Waku may provide additional opt-in APIs to abstract some of the complexity away for an improved developer experience.

#### Overview

Each layout and page in Waku is composed of a React component heirarchy.

It begins with a server component at the top of the tree. Then at points down the heirarchy, you'll eventually import a component that needs client component APIs. Mark this file with a `'use client'` directive at the top. When imported into a server component, it will create a server-client boundary. Below this point all imported components are hydrated and will run in the browser as well.

Server components can still be rendered below this boundary, but only via composition (e.g., `children` props).

#### Server components

Server components can be made async and can securely perform server-side logic and data fetching. Feel free to access the local file-system and import heavy dependencies since they aren't included in the client bundle. They have no state, interactivity, or access to browser APIs since they run exclusively on the server.

```tsx
// server component
import db from 'some-db';

import { Gallery } from '../components/gallery.js';

export const StorePage = async () => {
  const products = await db.query('SELECT * FROM products');

  return <Gallery products={products} />;
};
```

#### Client components

A `'use client'` directive placed at the top of a file will create a server-client boundary when the module is imported into a server component. All components imported below the boundary will be hydrated to run in the browser as well. They can use all traditional React features such as state, effects, and event handlers.

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
// ./src/templates/root-layout.tsx
import { Providers } from '../components/providers.js';

export const RootLayout = async ({ children }) => {
  return (
    <Providers>
      <main>{children}</main>
    </Providers>
  );
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

Waku provides static prerendering (SSG) or server-side rendering (SSR) options for layouts and pages including both their server and client components.

#### Further reading

To learn more about the modern React architecture, we recommend [Making Sense of React Server Components](https://www.joshwcomeau.com/react/server-components/) and [The Two Reacts: Part 1](https://overreacted.io/the-two-reacts/).

## Routing (low-level API)

The entry point for routing in Waku projects is `./src/entries.tsx`. Export the `createPages` function to create your layouts and pages programatically.

Both `createLayout` and `createPage` accept a configuration object to specify the route path, React component, and render method. Waku currently supports two options: `'static'` for static prerendering (SSG) or `'dynamic'` for server-side rendering (SSR).

For example, you can statically prerender a global header and footer in the root layout at build time, but dynamically render the rest of a home page at request time for personalized user experiences.

```tsx
// ./src/entries.tsx
import { createPages } from 'waku';

import { RootLayout } from './templates/root-layout.js';
import { HomePage } from './templates/home-page.js';

export default createPages(async ({ createPage, createLayout }) => {
  // Create root layout
  createLayout({
    render: 'static',
    path: '/',
    component: RootLayout,
  });

  // Create home page
  createPage({
    render: 'dynamic',
    path: '/',
    component: HomePage,
  });
});
```

### Pages

#### Single routes

Pages can be rendered as a single route (e.g., `/about`).

```tsx
// ./src/entries.tsx
import { createPages } from 'waku';

import { AboutPage } from './templates/about-page.js';
import { BlogIndexPage } from './templates/blog-index-page.js';

export default createPages(async ({ createPage }) => {
  // Create about page
  createPage({
    render: 'static',
    path: '/about',
    component: AboutPage,
  });

  // Create blog index page
  createPage({
    render: 'static',
    path: '/blog',
    component: BlogIndexPage,
  });
});
```

#### Segment routes

Pages can also render a segment route (e.g., `/blog/[slug]`). The rendered React component automatically receives a prop named by the segment (e.g, `slug`) with the value of the rendered route (e.g., `'introducing-waku'`). If statically prerendering a segment route at build time, a `staticPaths` array must also be provided.

```tsx
// ./src/entries.tsx
import { createPages } from 'waku';

import { BlogArticlePage } from './templates/blog-article-page.js';
import { ProductCategoryPage } from './templates/product-category-page.js';

export default createPages(async ({ createPage }) => {
  // Create blog article pages
  // `<BlogArticlePage>` receives `slug` prop
  createPage({
    render: 'static',
    path: '/blog/[slug]',
    staticPaths: ['introducing-waku', 'introducing-create-pages'],
    component: BlogArticlePage,
  });

  // Create product category pages
  // `<ProductCategoryPage>` receives `category` prop
  createPage({
    render: 'dynamic',
    path: '/shop/[category]',
    component: ProductCategoryPage,
  });
});
```

Static paths (or other values) could also be generated programatically.

```tsx
// ./src/entries.tsx
import { createPages } from 'waku';

import { getBlogPaths } from './lib/get-blog-paths.js';
import { BlogArticlePage } from './templates/blog-article-page.js';

export default createPages(async ({ createPage }) => {
  const blogPaths = await getBlogPaths();

  createPage({
    render: 'static',
    path: '/blog/[slug]',
    staticPaths: blogPaths,
    component: BlogArticlePage,
  });
});
```

#### Nested segment routes

Routes can contain multiple segments (e.g., `/shop/[category]/[product]`).

```tsx
// ./src/entries.tsx
import { createPages } from 'waku';

import { ProductDetailPage } from './templates/product-detail-page.js';

export default createPages(async ({ createPage }) => {
  // Create product detail pages
  // `<ProductDetailPage>` receives `category` and `product` props
  createPage({
    render: 'dynamic',
    path: '/shop/[category]/[product]',
    component: ProductDetailPage,
  });
});
```

For static prerendering of nested segment routes, the `staticPaths` array is instead comprised of ordered arrays.

```tsx
// ./src/entries.tsx
import { createPages } from 'waku';

import { ProductDetailPage } from './templates/product-detail-page.js';

export default createPages(async ({ createPage }) => {
  // Create product detail pages
  // `<ProductDetailPage>` receives `category` and `product` props
  createPage({
    render: 'static',
    path: '/shop/[category]/[product]',
    staticPaths: [
      ['someCategory', 'someProduct'],
      ['someCategory', 'anotherProduct'],
    ],
    component: ProductDetailPage,
  });
});
```

#### Catch-all routes

Catch-all or "wildcard" routes (e.g., `/app/[...catchAll]`) have indefinite segments. Wildcard routes receive a prop with segment values as an ordered array.

For example, the `/app/profile/settings` route would receive a `catchAll` prop with the value `['profile', 'settings']`. These values can then be used to determine what to render in the component.

```tsx
// ./src/entries.tsx
import { createPages } from 'waku';

import { DashboardPage } from './templates/dashboard-page.js';

export default createPages(async ({ createPage }) => {
  // Create account dashboard
  // `<DashboardPage>` receives `catchAll` prop (string[])
  createPage({
    render: 'dynamic',
    path: '/app/[...catchAll]',
    component: DashboardPage,
  });
});
```

### Layouts

Layouts wrap an entire route and its descendents. They must accept a `children` prop of type `ReactNode`. While not required, you will typically want at least a root layout.

#### Root layout

The root layout rendered at `path: '/'` is especially useful. It can be used for setting global styles, global metadata, global providers, global data, and global components, such as a header and footer.

```tsx
// ./src/entries.tsx
import { createPages } from 'waku';

import { RootLayout } from './templates/root-layout.js';

export default createPages(async ({ createLayout }) => {
  // Add a global header and footer
  createLayout({
    render: 'static',
    path: '/',
    component: RootLayout,
  });
});
```

```tsx
// ./src/templates/root-layout.tsx
import '../styles.css';

import { Providers } from '../components/providers.js';
import { Header } from '../components/header.js';
import { Footer } from '../components/footer.js';

export const RootLayout = async ({ children }) => {
  return (
    <Providers>
      <meta property="og:image" content="/images/preview.png" />
      <link rel="icon" type="image/png" href="/images/favicon.png" />
      <Header />
      <main>{children}</main>
      <Footer />
    </Providers>
  );
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

Layouts are also helpful further down the tree. For example, you could add a layout at `path: '/blog'` to add a sidebar to both the blog index and all blog article pages.

```tsx
// ./src/entries.tsx
import { createPages } from 'waku';

import { BlogLayout } from './templates/blog-layout.js';

export default createPages(async ({ createLayout }) => {
  // Add a sidebar to the blog index and blog article pages
  createLayout({
    render: 'static',
    path: '/blog',
    component: BlogLayout,
  });
});
```

```tsx
// ./src/templates/blog-layout.tsx
import { Sidebar } from '../components/sidebar.js';

export const BlogLayout = async ({ children }) => {
  return (
    <div className="flex">
      <div>{children}</div>
      <Sidebar />
    </div>
  );
};
```

## Navigation

Internal links should be made with the Waku `<Link />` component. It accepts a `to` prop for the destination, which is automatically prefetched ahead of the navigation.

```tsx
// ./src/templates/home-page.tsx
import { Link } from 'waku';

export const HomePage = async () => {
  return (
    <>
      <h1>Home</h1>
      <Link to="/about">About</Link>
    </>
  );
};
```

## Static assets

Static assets such as images, fonts, stylesheets, and scripts can be placed in a special `./public` folder of the Waku project root directory. The public directory structure is served relative to the `/` base path.

For example, an image added to `./public/images/logo.svg` can be rendered via `<img src="/images/logo.svg" />`.

## Data fetching

### Server

All of the wonderful patterns of React server components are supported. For example, you can compile MDX files or perform code syntax highlighting on the server with zero impact on the client bundle size.

```tsx
// ./src/templates/blog-article-page.tsx
import { MDX } from '../components/mdx.js';
import { getArticle } from '../lib/get-article.js';

export const BlogArticlePage = async ({ slug }) => {
  const article = await getArticle(slug);

  return (
    <>
      <title>{article.frontmatter.title}</title>
      <h1>{article.frontmatter.title}</h1>
      <MDX>{article.content}</MDX>
    </>
  );
};
```

### Client

Data should be fetched on the server when possible for the best user experience, but all data fetching libraries such as React Query should be compatible with Waku.

## State management

We recommend [Jotai](https://jotai.org) for global React state management based on the atomic model's performance and scalability, but Waku should be compatible with all React state management libraries such as Zustand and Valtio.

We're exploring a deeper integration of atomic state management into Waku to achieve the performance and developer experience of signals while preserving React's declarative programming model.

## Metadata

Waku automatically hoists any title, meta, and link tags to the document head. So adding meta tags is as simple as adding it to any of your layout or page components.

```tsx
// ./src/templates/root-layout.tsx
export const RootLayout = async ({ children }) => {
  return (
    <>
      <meta property="og:image" content="/images/preview.png" />
      <link rel="icon" type="image/png" href="/images/favicon.png" />
      {children}
    </>
  );
};
```

```tsx
// ./src/templates/home-page.tsx
export const HomePage = async () => {
  return (
    <>
      <title>Waku</title>
      <meta property="description" content="The minimal React framework" />
      <h1>Waku</h1>
      <div>Hello world!</div>
    </>
  );
};
```

Metadata could also be generated programatically.

```tsx
// ./src/templates/home-page.tsx
export const HomePage = async () => {
  return (
    <>
      <Head />
      <div>{/* ...*/}</div>
    </>
  );
};

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
```

## Styling

### Global styles

Install any required dev dependencies (e.g., `npm i -D tailwindcss autoprefixer`) and set up any required configuration (e.g., `postcss.config.js`). Then create your global stylesheet (e.g., `./src/styles.css`) and import it into the root layout.

```tsx
// ./src/templates/root-layout.tsx
import '../styles.css';

export const RootLayout = async ({ children }) => {
  return <main>{children}</main>;
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

## Environment variables

It's important to distinguish environment variables that must be kept secret from those that can be made public.

#### Private

By default all environment variables are considered private and accessible only in server components, which can be rendered exclusively in a secure environment. You must still take care not to inadvertently pass the variable as props to any client components.

#### Public

A special `WAKU_PUBLIC_` prefix is required to make an environment variable public and accessible in client components. They will be present as cleartext in the production JavaScript bundle sent to users browsers.

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
    "build": "waku build --with-ssr --with-vercel-static"
  }
}
```

### Netlify Deploy

Waku projects can be deployed to Netlify with the [Netlify CLI](https://docs.netlify.com/cli/get-started/).

```
npm run build -- --with-netlify
netlify deploy --dir=dist/public
```

#### Pure SSG

Adding the `--with-netlify-static` flag to the build script will produce static sites without Netlify functions.

```
{
  "scripts": {
    "build": "waku build --with-ssr --with-netlify-static"
  }
}
```

### Cloudflare (experimental)

```
npm run build -- --with-cloudflare
npx wrangler dev # or deploy
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

The handler entrypoint is `dist/serve.js` - see [Hono AWS Lambda Deploy Docs](https://hono.dev/getting-started/aws-lambda#_3-deploy)

## Community

Please join our friendly [GitHub discussions](https://github.com/dai-shi/waku/discussions) or [Discord server](https://discord.gg/MrQdmzd) to participate in the Waku community. Hope to see you there!

## Roadmap

Waku is in active development and we're seeking additional contributors. Check out our [roadmap](https://github.com/dai-shi/waku/issues/24) for more information.
