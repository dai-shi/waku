import { INTERNAL_iterateSerializablePlatformData } from '../../server.js';
import { joinPath } from '../utils/path.js';
import { mkdir, readFile, writeFile } from '../utils/node-fs.js';
import { DIST_ENTRIES_JS } from './constants.js';

const DIST_PLATFORM_DATA = 'platform-data';

export const emitPlatformData = async (distDir: string) => {
  const keys = new Set<string>();
  await mkdir(joinPath(distDir, DIST_PLATFORM_DATA), {
    recursive: true,
  });
  for (const [key, data] of INTERNAL_iterateSerializablePlatformData()) {
    keys.add(key);
    const destFile = joinPath(distDir, DIST_PLATFORM_DATA, key + '.js');
    await writeFile(destFile, `export default ${JSON.stringify(data)};`);
  }
  const distEntriesFile = joinPath(distDir, DIST_ENTRIES_JS);
  let distEntriesFileContent = await readFile(distEntriesFile, {
    encoding: 'utf8',
  });
  distEntriesFileContent = distEntriesFileContent.replace(
    'globalThis.__WAKU_LOAD_PLATFORM_DATA__',
    `
(key) => {
  switch (key) {
    ${Array.from(keys)
      .map(
        (k) =>
          `case '${k}': return import('./${DIST_PLATFORM_DATA}/${k}.js').then((m) => m.default);`,
      )
      .join('\n')}
    default: throw new Error('Cannot find platform data: ' + key);
  }
}
`,
  );
  await writeFile(distEntriesFile, distEntriesFileContent);
};
