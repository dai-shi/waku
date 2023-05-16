import { startPrdServer } from "./prdServer.js";

// FIXME maybe we should set NODE_ENV=production

const config =
  process.env.WAKUWORK_CONFIG && JSON.parse(process.env.WAKUWORK_CONFIG);

startPrdServer(config);
