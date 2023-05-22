import { startDevServer } from "./devServer.js";

process.env.NODE_ENV ||= "development";

const config = process.env.WAKU_CONFIG && JSON.parse(process.env.WAKU_CONFIG);

startDevServer(config);
