import { CodeBlock } from "../src/Code.js";

const code1 = `npm create wakuwork@latest
yarn create wakuwork
pnpm create wakuwork
`;

export default function Layout() {
  return (
    <>
      <h2 className="text-xl font-bold">Install</h2>
      <article className="mt-6">
        <div className="my-3">
          To start a new Wakuwork project, you can use any of the following
          commands, depending on your preferred package manager:
        </div>
        <div className="my-3">
          <CodeBlock lang="text">{code1}</CodeBlock>
        </div>
        <div className="my-3">
          These commands will create an example app that you can use as a
          starting point for your project.
        </div>
      </article>
    </>
  );
}
