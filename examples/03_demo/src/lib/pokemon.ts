import fs from 'node:fs';

export const pokemon = JSON.parse(
  fs.readFileSync('./private/pokemon.json', 'utf8'),
);
