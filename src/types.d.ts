declare module "react-server-dom-webpack/node-loader";
declare module "react-server-dom-webpack/server";
declare module "react-server-dom-webpack/server.node.unbundled";
declare module "react-server-dom-webpack/client";

// FIXME Is this too naive? How can we avoid the eslint warning?
// eslint-disable-next-line @typescript-eslint/no-unused-vars
namespace JSX {
  export type ElementType =
    | string
    | ((props: any) => React.ReactNode | Promise<React.ReactNode>);
}
