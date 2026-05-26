import { exec } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect } from '@playwright/test';
import { getManagedServerEntry } from '../packages/waku/dist/lib/utils/managed.js';
import { makeTempDir, test } from './utils.js';

const execAsync = promisify(exec);

const dryRunList = [
  // without waku.server.tsx
  {
    cwd: fileURLToPath(new URL('./fixtures/partial-build', import.meta.url)),
    project: 'partial-build',
  },
  // with waku.server.tsx
  {
    cwd: fileURLToPath(new URL('./fixtures/ssr-basic', import.meta.url)),
    project: 'ssr-basic',
  },
];

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const STATIC_NODE_MODULE_IMPORT_RE =
  /(?:^|[;\n])\s*import(?:\s+[\w*\s{},]+?\s+from)?\s*['"]node:module['"]/m;

type BuildPlatformTarget = {
  adapter: string;
  clearDirOrFile: string[];
  assertBuildOutput?: (dir: string) => void;
};

const directoryContainsPattern = (dir: string, pattern: RegExp): boolean => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (directoryContainsPattern(file, pattern)) {
        return true;
      }
    } else if (entry.isFile() && pattern.test(readFileSync(file, 'utf-8'))) {
      return true;
    }
  }
  return false;
};

const assertCloudflareBuildOutput = (dir: string) => {
  const file = join(dir, 'dist', 'server', 'wrangler.json');
  expect(existsSync(file)).toBe(true);
  const json = JSON.parse(readFileSync(file, 'utf-8')) as {
    main?: string;
    assets?: { directory?: string };
  };
  expect(json.main).toBe('index.js');
  expect(json.assets?.directory).toBeTruthy();
  const deployConfig = join(dir, '.wrangler', 'deploy', 'config.json');
  expect(existsSync(deployConfig)).toBe(true);
  const deployJson = JSON.parse(readFileSync(deployConfig, 'utf-8')) as {
    configPath?: string;
  };
  expect(deployJson.configPath).toBe('../../dist/server/wrangler.json');
  expect(
    directoryContainsPattern(
      join(dir, 'dist', 'server'),
      STATIC_NODE_MODULE_IMPORT_RE,
    ),
  ).toBe(false);
};

const buildPlatformTarget: BuildPlatformTarget[] = [
  {
    adapter: 'vercel',
    clearDirOrFile: ['dist', '.vercel'],
  },
  {
    adapter: 'netlify',
    clearDirOrFile: ['dist', 'netlify', 'netlify.toml'],
  },
  {
    adapter: 'cloudflare',
    clearDirOrFile: ['dist', 'wrangler.jsonc', '.wrangler'],
    assertBuildOutput: assertCloudflareBuildOutput,
  },
  {
    adapter: 'deno',
    clearDirOrFile: ['dist'],
  },
  {
    adapter: 'aws-lambda',
    clearDirOrFile: ['dist'],
  },
];

// Symlink each entry's realpath so the destination doesn't depend on pnpm's relative symlinks into the virtual store (https://github.com/pnpm/pnpm/issues/5717). Recurse into @scope dirs.
const linkNodeModules = (srcDir: string, destDir: string) => {
  mkdirSync(destDir);
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);
    if (entry.isDirectory() && entry.name.startsWith('@')) {
      linkNodeModules(srcPath, destPath);
    } else {
      symlinkSync(realpathSync(srcPath), destPath, 'junction');
    }
  }
};

const ensureServerEntryWithAdapter = (file: string, adapter: string) => {
  const content = existsSync(file)
    ? readFileSync(file, 'utf-8')
    : getManagedServerEntry('src');
  const replaced = content.replace(
    /import adapter from 'waku\/adapters\/default';/,
    `import adapter from 'waku/adapters/${adapter}';`,
  );
  if (replaced === content) {
    throw new Error(`Failed to replace adapter in ${file}`);
  }
  writeFileSync(file, replaced);
};

test.describe.configure({ mode: 'parallel' });

test.skip(
  ({ mode }) => mode !== 'PRD',
  'Build tests are only relevant in production mode.',
);

test.describe(`multi platform builds`, () => {
  for (const { cwd, project } of dryRunList) {
    for (const {
      adapter,
      clearDirOrFile,
      assertBuildOutput,
    } of buildPlatformTarget) {
      test(`build ${project} with ${adapter} should not throw error`, async () => {
        const temp = makeTempDir(project);
        const serverEntryFile = join(temp, 'src', 'waku.server.tsx');
        try {
          const cwdNodeModules = join(cwd, 'node_modules');
          cpSync(cwd, temp, {
            recursive: true,
            filter: (src) => !src.startsWith(cwdNodeModules),
          });
          linkNodeModules(cwdNodeModules, join(temp, 'node_modules'));
          ensureServerEntryWithAdapter(serverEntryFile, adapter);
          for (const name of clearDirOrFile) {
            rmSync(join(temp, name), { recursive: true, force: true });
          }
          await expect(
            execAsync(`node ${waku} build ${adapter}`, {
              cwd: temp,
              env: process.env,
            }),
          ).resolves.not.toThrow();
          assertBuildOutput?.(temp);
        } finally {
          rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
        }
      });
    }
  }
});
