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
          To use React Server Components in Wakuwork, you need to create an{" "}
          <Code>entries.ts</Code> file in the project root directory with a{" "}
          <Code>getEntry</Code> function that returns a server component module.
          Here's an example:
        </div>
        <div className="my-3">
          <CodeBlock lang="tsx">{code1}</CodeBlock>
        </div>
        <div className="my-1">
          The <Code>id</Code> parameter is the ID of the React Server Component
          that you want to load on the server. You specify the RSC ID from the
          client.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">Client API</h3>
      <article className="mt-6">
        <div className="my-1">
          To render a React Server Component on the client, you can use the{" "}
          <Code>serve</Code> function from <Code>wakuwork/client</Code> with the
          RSC ID to create a wrapper component. Here's an example:
        </div>
        <div className="my-3">
          <CodeBlock lang="tsx">{code2}</CodeBlock>
        </div>
        <div className="my-1">
          The <Code>name</Code> prop is passed to the React Server Component. We
          need to be careful to use <Code>serve</Code> to avoid client-server
          waterfalls. Usually, we should use it once close to the root
          component.
        </div>
      </article>
      <article className="mt-6">
        <div className="my-1">
          You can also re-render a React Server Component with new props. Here's
          an example just to illustrate the idea:
        </div>
        <div className="my-3">
          <CodeBlock lang="tsx">{code3}</CodeBlock>
        </div>
        <div className="my-1">
          Note that this is a little tricky and the API may be revisited in the
          future.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">Additional Server API</h3>
      <article className="mt-6">
        <div className="my-1">
          In addition to the <Code>getEntry</Code> function, you can also
          optionally export <Code>prefetcher</Code> and <Code>prerenderer</Code>{" "}
          functions in <Code>entries.ts</Code>. Here's an example:
        </div>
        <div className="my-3">
          <CodeBlock lang="tsx">{code4}</CodeBlock>
        </div>
        <div className="my-1">
          The <Code>prefetcher</Code> function is used for runtime optimization.
          It fetches React Server Components and client modules before the
          client becomes ready. Prefetching is basically to avoid waterfalls.
          Without it, the performance is suboptimal, but capability-wise it
          works.
        </div>
        <div className="my-1">
          <Code>prerenderer</Code> function is used for build-time optimization.
          It renders React Server Components during the build process to produce
          the output that will be sent to the client. Note that rendering here
          means to produce RSC payload not HTML content.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">How to try it</h3>
      <article className="mt-6">
        <div className="my-1">
          If you create a project with something like{" "}
          <Code>pnpm create wakuwork</Code>, it will create the minimal example
          app.
        </div>
      </article>
    </>
  );
}
