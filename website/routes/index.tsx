import type { ReactNode } from "react";

import { Link } from "wakuwork/router/server";

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
  <nav className="h-screen bg-gray-800 text-white overflow-y-auto">
    <Link
      href="/"
      pending={<Pending isPending />}
      notPending={<Pending isPending={false} />}
      unstable_prefetchOnEnter
    >
      <div className="flex items-center justify-center h-16 font-bold">
        Wakuwork
      </div>
    </Link>
    <ul className="pt-2 font-medium">
      <li className="h-12 mx-4">
        <MyLink href="/introduction" name="Introduction" />
      </li>
      <li className="h-12 mx-4">
        <MyLink href="/install" name="Install" />
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
  </nav>
);

const Home = () => <h1>Home</h1>;

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row">
      <aside className="w-full sm:w-64">
        <Sidebar />
      </aside>
      <main className="flex-1 p-3">{children || <Home />}</main>
    </div>
  );
}
