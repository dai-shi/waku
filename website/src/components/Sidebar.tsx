import { Link } from "../../../dist/router/server.js";
import { MyLink } from "./MyLink.js";
import { Pending } from "./Pending.js";

export const Sidebar = () => (
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
        <MyLink href="/docs/introduction" name="Introduction" />
      </li>
      <li className="h-12 mx-4">
        <MyLink href="/docs/installing" name="Installing" />
      </li>
      <li className="h-12 mx-4 text-gray-400">
        <span className="mx-4">Practices</span>
      </li>
      <li className="h-12 mx-6">
        <MyLink href="/docs/practices/minimal" name="Minimal" />
      </li>
      <li className="h-12 mx-6">
        <MyLink href="/docs/practices/router" name="Router" />
      </li>
    </ul>
  </div>
);
