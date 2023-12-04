import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

import { filePathToWinPath } from './path.js';

export const createReadStream = (filePath: string) =>
  fs.createReadStream(
    path.sep === '/' ? filePath : filePathToWinPath(filePath),
  );

export const createWriteStream = (filePath: string) =>
  fs.createWriteStream(
    path.sep === '/' ? filePath : filePathToWinPath(filePath),
  );

export const existsSync = (filePath: string) =>
  fs.existsSync(path.sep === '/' ? filePath : filePathToWinPath(filePath));

export const mkdirSync = (
  filePath: string,
  options?: { recursive?: boolean | undefined },
) =>
  fs.mkdirSync(
    path.sep === '/' ? filePath : filePathToWinPath(filePath),
    options,
  );

export const readdirSync = (filePath: string) =>
  fs.readdirSync(path.sep === '/' ? filePath : filePathToWinPath(filePath));

export const symlinkSync = (targetPath: string, filePath: string) =>
  fs.symlinkSync(
    path.sep === '/' ? targetPath : filePathToWinPath(targetPath),
    path.sep === '/' ? filePath : filePathToWinPath(filePath),
  );

export const writeFileSync = (filePath: string, content: string) =>
  fs.writeFileSync(
    path.sep === '/' ? filePath : filePathToWinPath(filePath),
    content,
  );

export const rename = (filePath1: string, filePath2: string) =>
  fsPromises.rename(
    path.sep === '/' ? filePath1 : filePathToWinPath(filePath1),
    path.sep === '/' ? filePath2 : filePathToWinPath(filePath2),
  );

export const mkdir = (
  filePath: string,
  options?: { recursive?: boolean | undefined },
) =>
  fsPromises.mkdir(
    path.sep === '/' ? filePath : filePathToWinPath(filePath),
    options,
  );

export const readFile = (filePath: string, options: { encoding: 'utf8' }) =>
  fsPromises.readFile(
    path.sep === '/' ? filePath : filePathToWinPath(filePath),
    options,
  );

export const writeFile = (filePath: string, content: string) =>
  fsPromises.writeFile(
    path.sep === '/' ? filePath : filePathToWinPath(filePath),
    content,
  );
