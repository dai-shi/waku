import type { ReactNode } from "react";

export type RouteProps = {
  path: string;
  search: string;
};

export type LinkProps = {
  href: string;
  children: ReactNode;
  pending?: ReactNode;
  notPending?: ReactNode;
  unstable_prefetchOnEnter?: boolean;
};

export function getComponentIds(pathname: string): readonly string[] {
  const pathItems = pathname.split("/").filter(Boolean);
  const componentIds: string[] = [];
  for (let index = 0; index <= pathItems.length; ++index) {
    const id = [
      ...pathItems.slice(0, index),
      ...(index === 0 || index < pathItems.length ? ["index"] : []),
    ].join("/");
    componentIds.push(id);
  }
  return componentIds;
}

const encode = (str: string) =>
  str === "" ? "=" : encodeURIComponent(str).replaceAll("%", "=");
const decode = (str: string) =>
  str === "=" ? "" : decodeURIComponent(str.replaceAll("=", "%"));

// FIXME The current input string format is not very good.
// Some difficulties are:
// - File name length limit for static files
// - encodeURIComponent is not predictable as servers automatically decode it
// - Readability in browser dev tools

export function getInputString(
  pathname: string,
  search: string,
  cached?: Record<string, RouteProps>,
): string {
  let input = search
    ? encode(pathname) + "/" + encode(search)
    : encode(pathname);
  if (cached) {
    input += "?" + encode(JSON.stringify(cached));
  }
  return input;
}

export function parseInputString(input: string): {
  pathname: string;
  search: string;
  cached?: Record<string, RouteProps>;
} {
  const [first, cached] = input.split("?", 2);
  if (!first) {
    throw new Error("Invalid input string");
  }
  const [pathname, search] = first.split("/", 2);
  if (!pathname) {
    throw new Error("Invalid input string");
  }
  return {
    pathname: decode(pathname),
    search: search ? decode(search) : "",
    ...(cached ? { cached: JSON.parse(decode(cached)) } : {}),
  };
}
