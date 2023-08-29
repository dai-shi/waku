import { Link } from "waku/router/server";

const Pending = ({ isPending }: { isPending: boolean }) => (
  <div
    className="animate-ping w-2 h-2 rounded-full"
    style={{
      backgroundColor: isPending ? "#B0452D" : "transparent",
      transition: "background-color 75ms 100ms",
    }}
  ></div>
);

export const MyLink = (props: {
  href: string;
  noPending?: boolean;
  children: React.ReactNode;
}) => (
  <div className="flex flex-row gap-1 items-center">
    <Link
      href={props.href}
      pending={props.noPending ? undefined : <Pending isPending />}
      notPending={props.noPending ? undefined : <Pending isPending={false} />}
      unstable_prefetchOnEnter
    >
      {props.children}
    </Link>
  </div>
);
