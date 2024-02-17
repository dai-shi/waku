import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

import type { ResolvedConfig } from '../config.js';

// XXX this can be very limited. FIXME if anyone has better knowledge.
export const emitPartyKitOutput = async (
  rootDir: string,
  config: ResolvedConfig,
) => {
  const partykitJsonFile = path.join(rootDir, 'partykit.json');
  if (!existsSync(partykitJsonFile)) {
    writeFileSync(
      partykitJsonFile,
      JSON.stringify(
        {
          name: 'waku-project',
          main: `${config.distDir}/${config.serveJs}`,
          compatibilityDate: '2023-02-16',
          assets: `./${config.distDir}/${config.publicDir}`,
        },
        null,
        2,
      ) + '\n',
    );
  }
};
