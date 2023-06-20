import { Link } from "waku/router/server";
import { Pending } from "./Pending.js";

export const MyLink = ({ name, href }: { name: string; href: string }) => (
  <Link
    href={href}
    pending={<Pending isPending />}
    notPending={<Pending isPending={false} />}
    unstable_prefetchOnEnter
  >
    <span className="text-gray-300 rounded-lg hover:bg-gray-700">
      <span className="">{name}</span>
    </span>
  </Link>
);
