import * as tar from 'tar';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'stream/web';

export type RepoInfo = {
  username: string | undefined;
  name: string | undefined;
  branch: string | undefined;
  filePath: string | undefined;
};

export async function isUrlOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * this is a part of the response type for github "Get a repository" API
 * @see {@link https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#get-a-repository|GitHub REST API}
 */
interface GetRepoInfo {
  /** A default branch of the repository */
  default_branch: string;
}
export async function getRepoInfo(url: URL): Promise<RepoInfo | undefined> {
  const [, username, name, t, _branch, ...file] = url.pathname.split('/');
  const filePath = file.join('/');

  if (
    // Support repos whose entire purpose is to be a waku example, e.g.
    // https://github.com/:username/:my-cool-waku-example-repo-name.
    t === undefined ||
    // Support GitHub URL that ends with a trailing slash, e.g.
    // https://github.com/:username/:my-cool-waku-example-repo-name/
    // In this case "t" will be an empty string while the next part "_branch" will be undefined
    (t === '' && _branch === undefined)
  ) {
    try {
      const infoResponse = await fetch(
        `https://api.github.com/repos/${username}/${name}`,
      );
      if (infoResponse.status !== 200) {
        return;
      }

      const info = (await infoResponse.json()) as GetRepoInfo;
      return { username, name, branch: info['default_branch'], filePath };
    } catch {
      return;
    }
  }

  if (username && name && _branch && t === 'tree') {
    return { username, name, branch: _branch, filePath };
  }
}

export function hasRepo({
  username,
  name,
  branch,
  filePath,
}: RepoInfo): Promise<boolean> {
  const contentsUrl = `https://api.github.com/repos/${username}/${name}/contents`;
  const packagePath = `${filePath ? `/${filePath}` : ''}/package.json`;

  return isUrlOk(contentsUrl + packagePath + `?ref=${branch}`);
}

export function existsInRepo(nameOrUrl: string): Promise<boolean> {
  try {
    const url = new URL(nameOrUrl);
    return isUrlOk(url.href);
  } catch {
    return isUrlOk(
      `https://api.github.com/repos/dai-shi/waku/contents/examples/${encodeURIComponent(
        nameOrUrl,
      )}`,
    );
  }
}

async function downloadTarStream(url: string) {
  const res = await fetch(url);

  if (!res.body) {
    throw new Error(`Failed to download: ${url}`);
  }

  return Readable.fromWeb(res.body as ReadableStream);
}

export async function downloadAndExtractRepo(
  root: string,
  { username, name, branch, filePath }: RepoInfo,
) {
  await pipeline(
    await downloadTarStream(
      `https://codeload.github.com/${username}/${name}/tar.gz/${branch}`,
    ),
    tar.x({
      cwd: root,
      strip: filePath ? filePath.split('/').length + 1 : 1,
      filter: (p) =>
        p.startsWith(
          `${name}-${branch?.replace(/\//g, '-')}${
            filePath ? `/${filePath}/` : '/'
          }`,
        ),
    }),
  );
}

export async function downloadAndExtractExample(root: string, name: string) {
  await pipeline(
    await downloadTarStream(
      'https://codeload.github.com/dai-shi/waku/tar.gz/main',
    ),
    tar.x({
      cwd: root,
      strip: 2 + name.split('/').length,
      filter: (p) => p.includes(`waku-main/examples/${name}/`),
    }),
  );
}
