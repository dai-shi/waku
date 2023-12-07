import type { Config, ResolvedConfig } from '../config.js';
import { normalizePath } from './utils/path.js';

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

// Keep async function for future extension
export async function resolveConfig(config: Config) {
  const resolvedConfig: ResolvedConfig = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    publicDir: 'public',
    assetsDir: 'assets',
    htmlsDir: 'htmls',
    indexHtml: 'index.html',
    entriesJs: 'entries.js',
    rscPath: 'RSC',
    ...config,
    ssr: {
      splitHTML,
      ...config?.ssr,
    },
    rootDir: normalizePath(config.rootDir),
  };
  return resolvedConfig;
}
