import { Code, CodeBlock } from "../../src/Code.js";

const code1 = `import { createRoot } from "react-dom/client";
import { Router } from "wakuwork/router/client";

const root = createRoot(document.getElementById("root")!);

root.render(<Router />);`;

const code2 = `import path from "node:path";
import url from "node:url";

import { fileRouter } from "wakuwork/router/server";

export default fileRouter(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "routes"
);`;

const code3 = `git clone https://github.com/dai-shi/wakuwork.git
cd wakuwork
npm install
npm run examples:dev:07_router`;

export default function Layout() {
  return (
    <>
      <h2 className="text-xl font-bold">Router Practice</h2>
      <article className="mt-6">
        <div className="my-3">
          Wakuwork provides a router built on top of the minimal API, and it
          serves as a reference implementation. While other router
          implementations can be used with Wakuwork, this page focuses on the{" "}
          <Code>wakuwork/router</Code> implementation.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">Client API</h3>
      <article className="mt-6">
        <div className="my-1">
          To use the router, it is required to use the <Code>Router</Code>{" "}
          component instead of using <Code>serve</Code> directly. The following
          code demonstrates how to use the <Code>Router</Code> component as the
          root component:
        </div>
        <div className="my-3">
          <CodeBlock lang="tsx">{code1}</CodeBlock>
        </div>
        <div className="my-1">
          The <Code>Router</Code> component internally uses <Code>serve</Code>{" "}
          and handles nested routes.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">Server API</h3>
      <article className="mt-6">
        <div className="my-1">
          In <Code>entries.ts</Code>, we use <Code>fileRouter</Code> to export
          all three functions <Code>getEntry</Code>, <Code>prefetcher</Code>,
          and <Code>prerenderer</Code> at once. Here's an example code:
        </div>
        <div className="my-3">
          <CodeBlock lang="tsx">{code2}</CodeBlock>
        </div>
        <div className="my-1">
          The implementation of the <Code>Router</Code> is file-based. However,
          it shouldn't be too difficult to provide a configuration-based router
          implementation if desired.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">How to try it</h3>
      <article className="mt-6">
        <div className="my-1">
          You can try an example app in the repository by cloning it and running
          the following commands:
        </div>
        <div className="my-3">
          <CodeBlock lang="text">{code3}</CodeBlock>
        </div>
        <div className="my-1">
          Alternatively, you could create a project with something like{" "}
          <Code>npm create wakuwork@latest</Code> and copy files from the
          example folder in the repository.
        </div>
      </article>
    </>
  );
}
