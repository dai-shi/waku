export default function Page() {
  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-cCarmine text-2xl font-bold">Introduction</h2>
      <article className="flex flex-col gap-4">
        <p>
          Waku is a React framework that supports React Server Components
          (RSCs), a new feature that will be available in a future version of
          React. RSCs allow developers to render UI components on the server,
          improving performance and enabling server-side features. To use RSCs,
          a framework is necessary for bundling, optionally server, router and
          so on.
        </p>
        <p>
          Waku takes a minimalistic approach, providing a minimal API that
          allows for multiple feature implementations and encourages growth in
          the ecosystem. For example, the minimal API is not tied to a specific
          router. This flexibility makes it easier to build new features.
        </p>
        <p>
          Waku uses Vite internally, and while it is still a work in progress,
          it will eventually support all of Vite&apos;s features. It can even
          work as a replacement for Vite + React client components. While using
          RSCs is optional, it is highly recommended for improved user and
          developer experiences.
        </p>
      </article>
    </div>
  );
}
