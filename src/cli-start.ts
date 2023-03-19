import { startPrdServer } from "./prdServer.js";

const config =
  process.env.WAKUWORK_CONFIG && JSON.parse(process.env.WAKUWORK_CONFIG);

startPrdServer(config);
