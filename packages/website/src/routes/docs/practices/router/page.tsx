import { Code, CodeBlock } from "../../../../components/Code.js";

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

const code3 = `import url from "node:url";
import path from "node:path";

import { glob } from "glob";
import { defineRouter } from "waku/router/server";

const routesDir = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "routes",
);

export default defineRouter(
  // getComponent (id is "**/layout" or "**/page")
  async (id) => {
    const files = await glob(${"`"}$\{id}.{tsx,js}${"`"}, { cwd: routesDir });
    if (files.length === 0) {
      return null;
    }
    const items = id.split("/");
    switch (items.length) {
      case 1:
        return import(${"`"}./routes/$\{items[0]}.tsx${"`"});
      case 2:
        return import(${"`"}./routes/$\{items[0]}/$\{items[1]}.tsx${"`"});
      case 3:
        return import(${"`"}./routes/$\{items[0]}/$\{items[1]}/$\{items[2]}.tsx${"`"});
      default:
        throw new Error("too deep route");
    }
  },
  // getPathsForBuild
  async () => {
    const files = await glob("**/page.{tsx,js}", { cwd: routesDir });
    return files.map(
      (file) => "/" + file.slice(0, Math.max(0, file.lastIndexOf("/"))),
    );
  },
);`;

const code4 = `git clone https://github.com/dai-shi/waku.git
cd waku
npm install
npm run examples:dev:07_router`;

export default function Page() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-cCarmine text-2xl font-bold">Router</h2>
        <h5>Practices</h5>
      </div>
      <article className="flex flex-col gap-4">
        <p>
          Waku provides a router built on top of the minimal API, and it serves
          as a reference implementation. While other router implementations can
          be used with Waku, this page focuses on the <Code>waku/router</Code>{" "}
          implementation.
        </p>

        <h3 className="text-lg font-bold mt-4">Client API</h3>
        <p>
          To use the router, it is required to use the <Code>Router</Code>{" "}
          component instead of using <Code>serve</Code> directly. The following
          code demonstrates how to use the <Code>Router</Code> component as the
          root component:
        </p>
        <CodeBlock lang="tsx">{code1}</CodeBlock>
        <p>
          The <Code>Router</Code> component internally uses <Code>serve</Code>{" "}
          and handles nested routes.
        </p>

        <h3 className="text-lg font-bold mt-4">Server API</h3>
        <p>
          In <Code>entries.ts</Code>, we use <Code>defineRouter</Code> to export{" "}
          <Code>getEntry</Code> and <Code>getBuildConfig</Code> at once.
          Here&apos;s a simple example code without builder:
        </p>
        <CodeBlock lang="tsx">{code2}</CodeBlock>
        <p>
          The implementation of the <Code>defineRouter</Code> is config-based.
          However, it isn&apos;t too difficult to make a file-based router.
          Here&apos;s a file-based example code with builder:
        </p>
        <CodeBlock lang="tsx">{code3}</CodeBlock>
        <p>
          Due to the limitation of bundler, we cannot automatically allow
          infinite depth of routes.
        </p>

        <h3 className="text-lg font-bold mt-4">How to try it</h3>
        <p>
          You can try an example app in the repository by cloning it and running
          the following commands:
        </p>
        <CodeBlock lang="shellscript">{code4}</CodeBlock>
        <p>
          Alternatively, you could create a project with something like{" "}
          <Code>npm create waku@latest</Code> and copy files from the example
          folder in the repository.
        </p>
      </article>
    </div>
  );
}
