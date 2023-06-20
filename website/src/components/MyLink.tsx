import { Link } from "waku/router/server";

export const MyLink = (props: {
  href: string;
  noPending?: boolean;
  children: React.ReactNode;
}) => (
  <div className="flex flex-row gap-1 items-center">
    <Link
      href={props.href}
      pending={
        props.noPending ? undefined : (
          <div className="animate-ping w-2 h-2 rounded-full bg-cCarmine"></div>
        )
      }
      notPending={
        props.noPending ? undefined : (
          <div className="w-2 h-2 rounded-full bg-transparent"></div>
        )
      }
      unstable_prefetchOnEnter
    >
      {props.children}
    </Link>
  </div>
);
