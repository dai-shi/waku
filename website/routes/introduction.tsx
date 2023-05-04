export default function Layout() {
  return (
    <>
      <h2 className="text-xl font-bold">Introduction</h2>
      <article className="mt-4">
        <div className="my-3">
          Wakuwork is a React framework with React Server Components (RSCs).
          RSCs are a new React feature that will be available in the future
          version. To use RSCs, we need a framework because they require
          bundling, optionally server, usually router, and so forth.
        </div>
        <div className="my-3">
          Wakuwork takes a minimalistic approach. It provides a minimal API and
          more features based on the API. For example, the minimal API is not
          tied to a specific router. This allows to create multiple router
          implementations and encourages ecosystem to grow.
        </div>
        <div className="my-3">
          Wakuwork internally uses Vite. It's still work in progress, but it
          should eventually use full Vite features. So, it can be a replacement
          for Vite + React client components. Using RSCs is optional but
          recommended for better UX and DX.
        </div>
      </article>
    </>
  );
}
