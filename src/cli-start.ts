import { startDevServer } from "./devServer.js";

const config =
  process.env.WAKUWORK_CONFIG && JSON.parse(process.env.WAKUWORK_CONFIG);

startDevServer(config);
