import type { Config } from '../config.js';
import { normalizePath } from './middleware/rsc/utils.js';

type DeepRequired<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
  ? { [P in keyof T]-?: DeepRequired<T[P]> }
  : T;

const splitHTML = (htmlStr: string): readonly [string, string, string] => {
  const P1 = [
    '<!--placeholder1-->\\s*<div[^>]*>',
    '</div>\\s*<!--/placeholder1-->',
  ] as const;
  const P2 = ['<!--placeholder2-->', '<!--/placeholder2-->'] as const;
  const anyRE = '[\\s\\S]*';
  const match = htmlStr.match(
    new RegExp(
      // prettier-ignore
      "^(" + anyRE + P1[0] + ")" + anyRE + "(" + P1[1] + anyRE + P2[0] + ")" + anyRE + "(" + P2[1] + anyRE + ")$",
    ),
  );
  if (match?.length !== 1 + 3) {
    throw new Error('Failed to split HTML');
  }
  return match.slice(1) as [string, string, string];
};

// HACK we hope to have a better solution soon.
let cwd: string | undefined;
export function setCwd(c: string) {
  cwd = c;
}
export function getCwd() {
  if (!cwd) {
    throw new Error('Unable to get cwd');
  }
  return cwd;
}

export async function resolveConfig() {
  // TODO windows support
  const configFile = getCwd() + '/' + 'waku.config.js';
  let config: Config = {};
  try {
    config = (await import(configFile)).default;
  } catch (e) {
    // ignored
  }
  const resolvedConfig: DeepRequired<Config> = {
    rootDir: normalizePath(getCwd()),
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    publicDir: 'public',
    indexHtml: 'index.html',
    entriesJs: 'entries.js',
    rscPath: 'RSC',
    ...config,
    ssr: {
      splitHTML,
      ...config?.ssr,
    },
  };
  return resolvedConfig;
}

// TODO we hope to eliminate this in the near future
export const viteInlineConfig = async () => {
  const [fs, path] = await Promise.all([
    import('node:fs'),
    import('node:path'),
  ]);
  for (const file of ['vite.config.ts', 'vite.config.js']) {
    if (fs.existsSync(file)) {
      return { configFile: path.resolve(file) };
    }
  }
  return {};
};
