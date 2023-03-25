export type RouteProps = {
  pathname: string;
  index: number;
  searchParams: string;
};

const CLIENT_REFERENCE = Symbol.for("react.client.reference");

export const WAKUWORK_ROUTER = "wakuwork/router";

export const childrenWrapperReference = Object.defineProperties({} as any, {
  $$typeof: { value: CLIENT_REFERENCE },
  $$id: { value: WAKUWORK_ROUTER + "#ChildrenWrapper" },
  $$async: { value: false },
});
