import { startDevServer } from "./devServer.js";

process.env.NODE_ENV ||= "development";

const config =
  process.env.WAKUWORK_CONFIG && JSON.parse(process.env.WAKUWORK_CONFIG);

startDevServer(config);
