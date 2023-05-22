import { startPrdServer } from "./prdServer.js";

process.env.NODE_ENV ||= "production";

const config =
  process.env.WAKUWORK_CONFIG && JSON.parse(process.env.WAKUWORK_CONFIG);

startPrdServer(config);
