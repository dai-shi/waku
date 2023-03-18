import { runBuild } from "./builder.js";

const config =
  process.env.WAKUWORK_CONFIG && JSON.parse(process.env.WAKUWORK_CONFIG);

runBuild(config);
