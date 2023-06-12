import { Code, CodeBlock } from "../../src/Code.js";

const code1 = `import { createRoot } from "react-dom/client";
import { Router } from "waku/router/client";

const root = createRoot(document.getElementById("root")!);

root.render(<Router />);`;

const code2 = `import { defineRouter } from "waku/router/server";

export default defineRouter(
  (id) => {
    switch (id) {
      case 'index':
        return import('./routes/index.tsx');
      case 'foo':
        return import('./routes/foo.tsx');
      default:
        throw new Error("no such route");
    }
  }
);`;

const code3 = `import path from "node:path";
import fs from "node:fs";

import { glob } from "glob";
import { defineRouter } from "waku/router/server";

export default defineRouter(
  (id) => {
    const items = id.split("/");
    switch (items.length) {
      case 1:
        return import(${"`"}./routes/$\{items[0]}.tsx${"`"});
      case 2:
        return import(${"`"}./routes/$\{items[0]}/$\{items[1]}.tsx${"`"});
      default:
        throw new Error("too deep route");
    }
  },
  async (root) => {
    const routesDir = path.join(root, "routes");
    const files = await glob("**/*.tsx", { cwd: routesDir });
    return files.map((file) => {
      const name = file.slice(0, file.length - path.extname(file).length);
      const stat = fs.statSync(path.join(routesDir, name), {
        throwIfNoEntry: false,
      });
      return stat?.isDirectory() ? name + "/" : name;
    });
  }
);`;

const code4 = `git clone https://github.com/dai-shi/waku.git
cd waku
npm install
npm run examples:dev:07_router`;

export default function Layout() {
  return (
    <>
      <h2 className="text-xl font-bold">Router Practice</h2>
      <article className="mt-6">
        <div className="my-3">
          Waku provides a router built on top of the minimal API, and it serves
          as a reference implementation. While other router implementations can
          be used with Waku, this page focuses on the <Code>waku/router</Code>{" "}
          implementation.
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
          In <Code>entries.ts</Code>, we use <Code>defineRouter</Code> to export{" "}
          <Code>getEntry</Code> and <Code>getBuildConfig</Code> at once.
          Here&apos;s a simple example code without builder:
        </div>
        <div className="my-3">
          <CodeBlock lang="tsx">{code2}</CodeBlock>
        </div>
        <div className="my-1">
          The implementation of the <Code>defineRouter</Code> is config-based.
          However, it isn&apos;t too difficult to make a file-based router.
          Here&apos;s a file-based example code with builder:
        </div>
        <div className="my-3">
          <CodeBlock lang="tsx">{code3}</CodeBlock>
        </div>
        <div className="my-1">
          Due to the limitation of bundler, we cannot automatically allow
          infinite depth of routes.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">How to try it</h3>
      <article className="mt-6">
        <div className="my-1">
          You can try an example app in the repository by cloning it and running
          the following commands:
        </div>
        <div className="my-3">
          <CodeBlock lang="shellscript">{code4}</CodeBlock>
        </div>
        <div className="my-1">
          Alternatively, you could create a project with something like{" "}
          <Code>npm create waku@latest</Code> and copy files from the example
          folder in the repository.
        </div>
      </article>
    </>
  );
}
