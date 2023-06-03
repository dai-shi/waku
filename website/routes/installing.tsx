import { CodeBlock } from "../src/Code.js";

const code1 = `npm create waku@latest
yarn create waku
pnpm create waku # pnpm not working for now`;

export default function Layout() {
  return (
    <>
      <h2 className="text-xl font-bold">Installing</h2>
      <article className="mt-6">
        <div className="my-3">
          To start a new Waku project, you can use any of the following
          commands, depending on your preferred package manager:
        </div>
        <div className="my-3">
          <CodeBlock lang="shellscript">{code1}</CodeBlock>
        </div>
        <div className="my-3">
          These commands will create an example app that you can use as a
          starting point for your project.
        </div>
      </article>
    </>
  );
}
