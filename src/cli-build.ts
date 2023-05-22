import { runBuild } from "./builder.js";

const config = process.env.WAKU_CONFIG && JSON.parse(process.env.WAKU_CONFIG);

await runBuild(config);
