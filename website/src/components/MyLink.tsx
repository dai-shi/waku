import { Link } from "waku/router/server";

export const MyLink = ({ name, href }: { name: string; href: string }) => (
  <Link
    href={href}
    pending={
      <div className="animate-ping w-2 h-2 rounded-full bg-cCarmine"></div>
    }
    notPending={
      <div className="w-2 h-2 rounded-full bg-transparent"></div>
    }
    unstable_prefetchOnEnter
  >
    {name}
  </Link>
);
