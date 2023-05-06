#!/usr/bin/env node

const path = require("node:path");
const fs = require("node:fs");
const https = require("node:https");

const dirName = "wakuwork-example";

if (fs.existsSync(dirName)) {
  console.error(`Directory "${dirName}" already exists!`);
  process.exit(1);
}

const baseUrl =
  "https://raw.githubusercontent.com/dai-shi/wakuwork/v0.9.3/examples/01_counter/";

const files = `
entries.ts
index.html
package.json
tsconfig.json
src/index.tsx
src/App.tsx
src/Counter.tsx
`
  .split(/\s/)
  .filter((file) => file);

const getFiles = (index = 0) => {
  const file = files[index];
  if (!file) return;
  const destFile = path.join(dirName, file.replace("/", path.sep));
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  https.get(baseUrl + file, (res) => {
    res.pipe(fs.createWriteStream(destFile));
    res.on("end", () => getFiles(index + 1));
  });
};

getFiles();

process.on("exit", (code) => {
  if (!code) {
    console.info(`Done! Change directory "${dirName}"`);
  }
});
