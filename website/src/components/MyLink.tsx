import { Link } from "waku/router/server";
import { Pending } from "./Pending.js";

export const MyLink = ({ name, href }: { name: string; href: string }) => (
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
