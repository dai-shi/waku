import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'stream/web';
import * as tar from 'tar';
import { red, cyan } from 'kolorist';

type RepoInfo = {
  username: string | undefined;
  name: string | undefined;
  branch: string | undefined;
  filePath: string | undefined;
};

async function isUrlOk(url: string): Promise<boolean> {
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
async function getRepoInfo(url: URL): Promise<RepoInfo | undefined> {
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

function hasRepo({
  username,
  name,
  branch,
  filePath,
}: RepoInfo): Promise<boolean> {
  const contentsUrl = `https://api.github.com/repos/${username}/${name}/contents`;
  const packagePath = `${filePath ? `/${filePath}` : ''}/package.json`;

  return isUrlOk(contentsUrl + packagePath + `?ref=${branch}`);
}

function existsInRepo(nameOrUrl: string, ref: string): Promise<boolean> {
  try {
    const url = new URL(nameOrUrl);
    return isUrlOk(url.href);
  } catch {
    const params = new URLSearchParams({ ref });
    return isUrlOk(
      `https://api.github.com/repos/dai-shi/waku/contents/examples/${encodeURIComponent(
        nameOrUrl,
      )}?${params}`,
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

async function downloadAndExtractRepo(
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

async function downloadAndExtractExample(
  root: string,
  name: string,
  ref: string,
) {
  await pipeline(
    await downloadTarStream(
      `https://codeload.github.com/dai-shi/waku/tar.gz/${ref}`,
    ),
    tar.x({
      cwd: root,
      strip: 2 + name.split('/').length,
      filter: (p) =>
        p.replace(/waku-[^/]+\//, '').includes(`examples/${name}/`),
    }),
  );
}

export async function parseExampleOption(
  example: string | undefined,
  defaultRef: string,
): Promise<RepoInfo | string | undefined> {
  if (!example) {
    return undefined;
  }

  let repoInfo: RepoInfo | undefined;
  let repoUrl: URL | undefined;

  try {
    repoUrl = new URL(example);
  } catch (error: unknown) {
    const err = error as Error & { code: string | undefined };
    if (err.code !== 'ERR_INVALID_URL') {
      console.error(error);
      process.exit(1);
    }
  }

  if (repoUrl) {
    // NOTE check github origin
    if (repoUrl.origin !== 'https://github.com') {
      console.error(
        `Invalid URL: ${red(
          `"${example}"`,
        )}. Only GitHub repositories are supported. Please use a GitHub URL and try again.`,
      );
      process.exit(1);
    }

    repoInfo = await getRepoInfo(repoUrl);

    // NOTE validate reproInfo
    if (!repoInfo) {
      console.error(
        `Found invalid GitHub URL: ${red(
          `"${example}"`,
        )}. Please fix the URL and try again.`,
      );
      process.exit(1);
    }

    const found = await hasRepo(repoInfo);
    // NOTE Do the repo exist?
    if (!found) {
      console.error(
        `Could not locate the repository for ${red(
          `"${example}"`,
        )}. Please check that the repository exists and try again.`,
      );
      process.exit(1);
    }
  } else {
    const found = await existsInRepo(example, defaultRef);

    if (!found) {
      console.error(
        `Could not locate an example named ${red(
          `"${example}"`,
        )}. Please check that the example exists and try again.`,
      );
      process.exit(1);
    }
    return example;
  }
  return repoInfo;
}

function isErrorLike(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}

export async function downloadAndExtract(
  example: string,
  root: string,
  repoInfo: RepoInfo | string,
  defaultRef: string,
): Promise<void> {
  try {
    if (typeof repoInfo === 'string') {
      console.log(
        `Downloading files for example ${cyan(example)}. This might take a moment.`,
      );
      console.log();
      await downloadAndExtractExample(root, example, defaultRef);
    } else {
      console.log(
        `Downloading files from repo ${cyan(example)}. This might take a moment.`,
      );
      console.log();
      await downloadAndExtractRepo(root, repoInfo);
    }
  } catch (reason) {
    // download error
    throw new Error(isErrorLike(reason) ? reason.message : reason + '');
  }

  // TODO automatically installing dependencies
  // 1. check packageManager
  // 2. and then install dependencies
}
