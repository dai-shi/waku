import { Code, CodeBlock } from "../../../components/Code.js";

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
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-cCarmine text-2xl font-bold">Minimal</h2>
        <h5>Practices</h5>
      </div>
      <article className="flex flex-col gap-4">
        <h3 className="text-lg font-bold">Server API</h3>
        <p>
          To use React Server Components in Waku, you need to create an{" "}
          <Code>entries.ts</Code> file in the project root directory with a{" "}
          <Code>getEntry</Code> function that returns a server component module.
          Here&apos;s an example:
        </p>
        <CodeBlock lang="tsx">{code1}</CodeBlock>
        <p>
          The <Code>id</Code> parameter is the ID of the React Server Component
          that you want to load on the server. You specify the RSC ID from the
          client.
        </p>

        <h3 className="text-lg font-bold mt-4">Client API</h3>
        <p>
          To render a React Server Component on the client, you can use the{" "}
          <Code>serve</Code> function from <Code>waku/client</Code> with the RSC
          ID to create a wrapper component. Here&apos;s an example:
        </p>
        <CodeBlock lang="tsx">{code2}</CodeBlock>
        <p>
          The <Code>name</Code> prop is passed to the React Server Component. We
          need to be careful to use <Code>serve</Code> to avoid client-server
          waterfalls. Usually, we should use it once close to the root
          component.
        </p>
        <p>
          You can also re-render a React Server Component with new props.
          Here&apos;s an example just to illustrate the idea:
        </p>
        <CodeBlock lang="tsx">{code3}</CodeBlock>
        <p>
          Note that this is a little tricky and the API may be revisited in the
          future.
        </p>

        <h3 className="text-lg font-bold mt-4">Additional Server API</h3>
        <p>
          In addition to the <Code>getEntry</Code> function, you can also
          optionally specify <Code>getBuildConfig</Code> function in{" "}
          <Code>entries.ts</Code>. Here&apos;s an example:
        </p>
        <CodeBlock lang="tsx">{code4}</CodeBlock>
        <p>
          The <Code>getBuildConfig</Code> function is used for build-time
          optimization. It renders React Server Components during the build
          process to produce the output that will be sent to the client. Note
          that rendering here means to produce RSC payload not HTML content.
        </p>
        <h3 className="text-lg font-bold mt-4">How to try it</h3>
        <p>
          If you create a project with something like{" "}
          <Code>npm create waku@latest</Code>, it will create the minimal
          example app.
        </p>
      </article>
    </div>
  );
}
