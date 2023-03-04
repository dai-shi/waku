import { startDevServer } from "./devServer.js";

const opts: Record<string, string> = {};

process.argv.forEach((arg, index) => {
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const value = process.argv[index + 1] || "";
    try {
      opts[key] = JSON.parse(value);
    } catch (e) {
      opts[key] = value;
    }
  }
});

startDevServer(opts);
