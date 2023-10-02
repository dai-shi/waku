export { rsc } from "./lib/middleware/rsc.js";
export { ssr } from "./lib/middleware/ssr.js";

export async function devServer() {
  return (await import("./lib/middleware/devServer.js")).devServer();
}

export async function build() {
  return (await import("./lib/builder.js")).build();
}
