import { build } from "./builder.js";

const runBuild = (_config: unknown) => build();

const config = process.env.WAKU_CONFIG && JSON.parse(process.env.WAKU_CONFIG);

await runBuild(config);
