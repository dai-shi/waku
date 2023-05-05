import { Code, CodeBlock } from "../../src/Code.js";

const code1 = `import type { GetEntry } from "wakuwork/server";

export const getEntry: GetEntry = async (id) => {
  switch (id) {
    case "App":
      return import("./src/App.js");
    default:
      throw new Error(\`Unknown entry id: \${id}\`);
  }
};
`;

const code2 = `import { createRoot } from "react-dom/client";
import { serve } from "wakuwork/client";

const root = createRoot(document.getElementById("root")!);
const App = serve<{ name: string }>("App");
root.render(<App name="Wakuwork" />);
`;

const code3 = `import { useState, useEffect } from "react";
import { serve } from "wakuwork/client";

const App = serve<{ name: string }>("App");

const ContrivedRefetcher = () => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => c + 1), 5000);
    return () => clearInterval(id);
  }, []);
  return <App name={'count' + count} />;
};
`;

const code4 = `import type { GetEntry, Prefetcher, Prerenderer } from "wakuwork/server";

export const getEntry: GetEntry = async (id) => {
  switch (id) {
    case "App":
      return import("./src/App.js");
    default:
      throw new Error(\`Unknown entry id: \${id}\`);
  }
};

export const prefetcher: Prefetcher = async (path) => {
  switch (path) {
    case "/":
      return {
        entryItems: [["App", { name: "Wakuwork" }]],
        clientModules: [(await import("./src/Counter.js")).Counter],
      };
    default:
      return {};
  }
};

export const prerenderer: Prerenderer = async () => {
  return {
    entryItems: [["App", { name: "Wakuwork" }]],
    paths: ["/"],
  };
};
`;

export default function Layout() {
  return (
    <>
      <h2 className="text-xl font-bold">Minimal Practice</h2>
      <h3 className="text-lg font-bold mt-8">Server API</h3>
      <article className="mt-6">
        <div className="my-1">
          We need to put <Code>entries.ts</Code> file in the project root
          directly. The required export function is <Code>getEntry</Code>.
        </div>
        <div className="my-3">
          <CodeBlock>{code1}</CodeBlock>
        </div>
        <div className="my-1">
          The parameter <Code>id</Code> is what we call RSC ID. We specify it
          from client.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">Client API</h3>
      <article className="mt-6">
        <div className="my-1">
          To render RSC, create a wrapper component in client with the RSC ID.
        </div>
        <div className="my-3">
          <CodeBlock>{code2}</CodeBlock>
        </div>
        <div className="my-1">
          We need to be careful to use <Code>serve</Code> to avoid client-server
          waterfalls. Usually, we should use it once close to the root
          component.
        </div>
      </article>
      <article className="mt-6">
        <div className="my-1">We could re-render RSC with new props.</div>
        <div className="my-3">
          <CodeBlock>{code3}</CodeBlock>
        </div>
        <div className="my-1">
          This is a little tricky and we may revisit the API. Probably it should
          only be used within a library and not exposed to end developers.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">Additional Server API</h3>
      <article className="mt-6">
        <div className="my-1">
          There two more optional functions we can expose from `entries.ts` in
          addition to the required `getEntry` function. They are `prefetcher`
          and `prerenderer`.
        </div>
        <div className="my-3">
          <CodeBlock>{code4}</CodeBlock>
        </div>
        <div className="my-1">
          The `prefetcher` function is mainly used for run-time optimization. It
          fetches RSCs and client modules in advance for client to become ready.
          Prefetching is basically to avoid waterfalls. Without it, the
          performance is suboptimal, but capability-wise it just works.
        </div>
        <div className="my-1">
          The `prerenderer` function is used for build-time optimization. It
          renders RSCs during build. Note that rendering here means to produce
          RSC payload not HTML content.
        </div>
      </article>
    </>
  );
}
