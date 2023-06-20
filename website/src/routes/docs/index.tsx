import type { ReactNode } from "react";

import { Link } from "waku/router/server";

const Pending = ({ isPending }: { isPending: boolean }) => (
  <span
    style={{
      marginLeft: 5,
      transition: "opacity 75ms 100ms",
      opacity: isPending ? 1 : 0,
    }}
  >
    Pending...
  </span>
);

const MyLink = ({ name, href }: { name: string; href: string }) => (
  <Link
    href={href}
    pending={<Pending isPending />}
    notPending={<Pending isPending={false} />}
    unstable_prefetchOnEnter
  >
    <span className="py-2 text-gray-300 rounded-lg hover:bg-gray-700">
      <span className="mx-4">{name}</span>
    </span>
  </Link>
);

const Sidebar = () => (
  <div className="h-screen bg-gray-800 text-white overflow-y-auto">
    <Link
      href="/"
      pending={<Pending isPending />}
      notPending={<Pending isPending={false} />}
      unstable_prefetchOnEnter
    >
      <div className="flex items-center justify-center h-16 font-bold">
        Waku
      </div>
    </Link>
    <ul className="pt-2 font-medium">
      <li className="h-12 mx-4">
        <MyLink href="/introduction" name="Introduction" />
      </li>
      <li className="h-12 mx-4">
        <MyLink href="/installing" name="Installing" />
      </li>
      <li className="h-12 mx-4 text-gray-400">
        <span className="mx-4">Practices</span>
      </li>
      <li className="h-12 mx-6">
        <MyLink href="/practices/minimal" name="Minimal" />
      </li>
      <li className="h-12 mx-6">
        <MyLink href="/practices/router" name="Router" />
      </li>
    </ul>
  </div>
);

const Home = () => (
  <>
    <h2 className="text-xl font-bold">Waku</h2>
    <article className="mt-6 bg-gray-800 text-white p-12 rounded">
      <div className="text-3xl">
        Minimalistic React Framework with React Server Components
      </div>
    </article>
  </>
);

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row">
      <nav className="w-full sm:w-64">
        <Sidebar />
      </nav>
      <main className="flex-1 p-6 w-full sm:w-[calc(100%-16rem)]">
        {children || <Home />}
      </main>
    </div>
  );
}
