import { existsSync, readFileSync } from 'node:fs';

export const loadReadme = (): string => {
  const fileName = existsSync('./README.md')
    ? './README.md'
    : '../../README.md';
  const file = readFileSync(fileName, 'utf8');
  return file;
};
