const fs = require('fs');
const { exec } = require('child_process');

const dirName = 'wanakwork-example';

if (fs.existsSync(dirName)) {
  throw new Error('Directory already exists');
}

fs.mkdirSync(dirName);

exec(`curl -L https://github.com/dai-shi/wakuwork/archive/v0.7.1.tar.gz | tar -x --directory ${dirName} --strip-components=3 wakuwork-0.7.1/examples/01_counter`)
