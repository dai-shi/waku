import { CodeBlock } from "../../components/Code.js";

const code1 = `npm create waku@latest
yarn create waku
pnpm create waku # pnpm not working for now`;

export default function Layout() {
  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-cCarmine text-2xl font-bold">Installing</h2>
      <article className="flex flex-col gap-4">
        <p>
          To start a new Waku project, you can use any of the following
          commands, depending on your preferred package manager:
        </p>
        <CodeBlock lang="shellscript">{code1}</CodeBlock>
        <p>
          These commands will create an example app that you can use as a
          starting point for your project.
        </p>
      </article>
    </div>
  );
}
