declare module "react-server-dom-webpack/node-loader";
declare module "react-server-dom-webpack/server";
declare module "react-server-dom-webpack/server.node.unbundled";
declare module "react-server-dom-webpack/client";

// FIXME is this too naive?
namespace JSX {
  export type ElementType =
    | string
    | ((props: any) => React.ReactNode | Promise<React.ReactNode>);
}
