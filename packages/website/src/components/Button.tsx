import { ReactNode } from "react";

export function Button(props: {
  text: string;
  href: string;
  icon: ReactNode;
  variant: "primary" | "secondary";
}) {
  return (
    <a
      href={props.href}
      className={`rounded-full px-4 py-1 flex flex-row items-center gap-1 border border-cBlack ${
        props.variant === "primary"
          ? "bg-cCarmine text-cWhite"
          : "bg-transparent"
      }`}
    >
      <p>{props.text}</p>
      {props.icon}
    </a>
  );
}
