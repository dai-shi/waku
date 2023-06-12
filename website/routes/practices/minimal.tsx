import { Code, CodeBlock } from "../../src/Code.js";

const code1 = `import { defineEntries } from "waku/server";

export default defineEntries(
  // getEntry
  async (id) => {
    switch (id) {
      case "App":
        return import("./src/App.js");
      default:
        return null;
    }
  }
);`;

const code2 = `import { createRoot } from "react-dom/client";
import { serve } from "waku/client";

const root = createRoot(document.getElementById("root")!);
const App = serve<{ name: string }>("App");
root.render(<App name="Waku" />);`;

const code3 = `import { useState, useEffect } from "react";
import { serve } from "waku/client";

const App = serve<{ name: string }>("App");

const ContrivedRefetcher = () => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => c + 1), 5000);
    return () => clearInterval(id);
  }, []);
  return <App name={'count' + count} />;
};`;

const code4 = `import { defineEntries } from "waku/server";

export default defineEntries(
  // getEntry
  async (id) => {
    switch (id) {
      case "App":
        return import("./src/App.js");
      default:
        return null;
    }
  },
  // getBuildConfig
  async () => {
    return {
      "/": {
        elements: [["App", { name: "Waku" }]],
      },
    };
  }
);`;

export default function Layout() {
  return (
    <>
      <h2 className="text-xl font-bold">Minimal Practice</h2>
      <h3 className="text-lg font-bold mt-8">Server API</h3>
      <article className="mt-6">
        <div className="my-1">
          To use React Server Components in Waku, you need to create an{" "}
          <Code>entries.ts</Code> file in the project root directory with a{" "}
          <Code>getEntry</Code> function that returns a server component module.
          Here&apos;s an example:
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
          <Code>serve</Code> function from <Code>waku/client</Code> with the RSC
          ID to create a wrapper component. Here&apos;s an example:
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
          You can also re-render a React Server Component with new props.
          Here&apos;s an example just to illustrate the idea:
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
          optionally specify <Code>getBuildConfig</Code> function in{" "}
          <Code>entries.ts</Code>. Here&apos;s an example:
        </div>
        <div className="my-3">
          <CodeBlock lang="tsx">{code4}</CodeBlock>
        </div>
        <div className="my-1">
          The <Code>getBuildConfig</Code> function is used for build-time
          optimization. It renders React Server Components during the build
          process to produce the output that will be sent to the client. Note
          that rendering here means to produce RSC payload not HTML content.
        </div>
      </article>
      <h3 className="text-lg font-bold mt-8">How to try it</h3>
      <article className="mt-6">
        <div className="my-1">
          If you create a project with something like{" "}
          <Code>npm create waku@latest</Code>, it will create the minimal
          example app.
        </div>
      </article>
    </>
  );
}
