export default function Layout() {
  return (
    <>
      <h2 className="text-xl font-bold">Install</h2>
      <article className="mt-4">
        <p className="my-3">
          To start a new Wakuwork project, you can use the following commands.
          It will create an example app.
        </p>
        <p className="my-3 p-4 bg-gray-300 rounded-lg">
          {/* prettier-ignore */}
          <code className="whitespace-pre overflow-x-scroll">
npm create wakuwork@latest<br />
yarn create wakuwork<br />
pnpm create wakuwork<br />
          </code>
        </p>
      </article>
    </>
  );
}
