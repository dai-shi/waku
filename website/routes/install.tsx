import { CodeBlock } from "../src/Code.js";

const code1 = `npm create wakuwork@latest
yarn create wakuwork
pnpm create wakuwork
`;

export default function Layout() {
  return (
    <>
      <h2 className="text-xl font-bold">Install</h2>
      <article className="mt-4">
        <div className="my-3">
          To start a new Wakuwork project, you can use the following commands.
          It will create an example app.
        </div>
        <div className="my-3">
          <CodeBlock>{code1}</CodeBlock>
        </div>
      </article>
    </>
  );
}
