import { startPrdServer } from "./prdServer.js";

process.env.NODE_ENV ||= "production";

const config = process.env.WAKU_CONFIG && JSON.parse(process.env.WAKU_CONFIG);

startPrdServer(config);
