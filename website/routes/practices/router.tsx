import { Code, CodeBlock } from "../../src/Code.js";

const code1 = `import { createRoot } from "react-dom/client";
import { Router } from "wakuwork/router/client";

const root = createRoot(document.getElementById("root")!);

root.render(<Router />);
`;

const code2 = `import path from "node:path";
import url from "node:url";
import { fileRouter } from "wakuwork/router/server";

export const { getEntry, prefetcher, prerenderer } = fileRouter(
  path.join(path.dirname(url.fileURLToPath(import.meta.url)), "routes")
);
`;

const code3 = `git clone https://github.com/dai-shi/wakuwork.git
cd wakuwork
pnpm i
pnpm run examples:dev:07_router
`;

export default function Layout() {
  return (
    <>
      <h2 className="text-xl font-bold">Router Practice</h2>
      <article className="mt-6">
        <div className="my-3">
          Wakuwork provides a router. It's built on top of the minimal API. It's
          one of routers and it is to be a reference implementation. There can
          be several router implementations with Wakuwork. In this page, we
          describe about `wakuwork/router`.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">Client API</h3>
      <article className="mt-6">
        <div className="my-1">
          Instead of using <Code>serve</Code> directly, we use{" "}
          <Code>Router</Code> at the root component.
        </div>
        <div className="my-3">
          <CodeBlock>{code1}</CodeBlock>
        </div>
        <div className="my-1">
          <Code>Router</Code> internally uses <Code>serve</Code> and handles
          nested routes.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">Server API</h3>
      <article className="mt-6">
        <div className="my-1">
          In <Code>entries.ts</Code>, we use `fileRouter` to export all three
          functions `getEntry`, `prefetcher` and `prerenderer` at once.
        </div>
        <div className="my-3">
          <CodeBlock>{code2}</CodeBlock>
        </div>
        <div className="my-1">
          This is file-based router implementation. We could technically provide
          config based router implementation that is compatible, if desired.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">How to try it</h3>
      <article className="mt-6">
        <div className="my-1">
          You can try an example app in the repository.
        </div>
        <div className="my-3">
          <CodeBlock>{code3}</CodeBlock>
        </div>
        <div className="my-1">
          You could also create a project with something like{" "}
          <Code>pnpm create wakuwork</Code> and copy files from the example
          folder of the repository.
        </div>
      </article>
    </>
  );
}
