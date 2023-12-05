import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

const filePathToOsPath = (filePath: string) =>
  path.sep === '/' ? filePath : filePath.replace(/\//g, '\\');

export const createReadStream = (filePath: string) =>
  fs.createReadStream(filePathToOsPath(filePath));

export const createWriteStream = (filePath: string) =>
  fs.createWriteStream(filePathToOsPath(filePath));

export const existsSync = (filePath: string) =>
  fs.existsSync(filePathToOsPath(filePath));

export const readdirSync = (filePath: string) =>
  fs.readdirSync(filePathToOsPath(filePath));

export const renameSync = (filePath1: string, filePath2: string) =>
  fs.renameSync(filePathToOsPath(filePath1), filePathToOsPath(filePath2));

export const mkdirSync = (
  filePath: string,
  options?: { recursive?: boolean | undefined },
) => fs.mkdirSync(filePathToOsPath(filePath), options);

export const symlinkSync = (targetPath: string, filePath: string) =>
  fs.symlinkSync(filePathToOsPath(targetPath), filePathToOsPath(filePath));

export const readFile = (filePath: string, options: { encoding: 'utf8' }) =>
  fsPromises.readFile(filePathToOsPath(filePath), options);

export const writeFile = (filePath: string, content: string) =>
  fsPromises.writeFile(filePathToOsPath(filePath), content);

export const stat = (filePath: string) =>
  fsPromises.stat(filePathToOsPath(filePath));
