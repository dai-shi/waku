import { Code, CodeBlock } from "../../src/Code.js";

const code1 = `import type { GetEntry, Prefetcher, Prerenderer } from "wakuwork/server";

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

export default function Layout() {
  return (
    <>
      <h2 className="text-xl font-bold">Minimal Practice</h2>
      <h3 className="text-lg font-bold mt-2">Server API</h3>
      <article className="mt-4">
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
      <h3 className="text-lg font-bold mt-2">Client API</h3>
      <article className="mt-4">
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
      {/* TODO counter example, additonal apis */}
    </>
  );
}
