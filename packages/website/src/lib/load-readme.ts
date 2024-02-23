import { readFileSync } from 'node:fs';

export const loadReadme = (): string => {
  const file = readFileSync('./private/README.md', 'utf8');
  return file;
};
