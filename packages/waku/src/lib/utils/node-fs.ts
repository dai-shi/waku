import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

export const filePathToVitePath = (filePath: string) => {
  if (!filePath.startsWith('/')) {
    throw new Error('filePath must be absolute');
  }
  return path.sep === '/' ? filePath : filePath.replace(/^\//g, '');
};

const filePathToOsPath = (filePath: string) =>
  path.sep === '/'
    ? filePath
    : filePath.replace(/^\//, '').replace(/\//g, '\\');

export const createReadStream = (filePath: string) =>
  fs.createReadStream(filePathToOsPath(filePath));

export const createWriteStream = (filePath: string) =>
  fs.createWriteStream(filePathToOsPath(filePath));

export const existsSync = (filePath: string) =>
  fs.existsSync(filePathToOsPath(filePath));

export const readdir = (filePath: string) =>
  fsPromises.readdir(filePathToOsPath(filePath));

export const rename = (filePath1: string, filePath2: string) =>
  fsPromises.rename(filePathToOsPath(filePath1), filePathToOsPath(filePath2));

export const mkdir = (
  filePath: string,
  options?: { recursive?: boolean | undefined },
) => fsPromises.mkdir(filePathToOsPath(filePath), options);

export const symlink = (targetPath: string, filePath: string) =>
  fsPromises.symlink(filePathToOsPath(targetPath), filePathToOsPath(filePath));

export const readFile = (filePath: string, options: { encoding: 'utf8' }) =>
  fsPromises.readFile(filePathToOsPath(filePath), options);

export const writeFile = (filePath: string, content: string) =>
  fsPromises.writeFile(filePathToOsPath(filePath), content);

export const stat = (filePath: string) =>
  fsPromises.stat(filePathToOsPath(filePath));
