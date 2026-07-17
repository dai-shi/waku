import fs from 'node:fs';

/* global process */
const file = process.argv[2];

const config = JSON.parse(fs.readFileSync(file, 'utf-8'));
config.routes.push(
  {
    src: '/discord',
    status: 307,
    headers: { Location: 'https://discord.gg/MrQdmzd' },
  },
  {
    src: '/guides/getting-started',
    status: 308,
    headers: { Location: '/guides/quick-start' },
  },
  {
    src: '/RSC/(.*)',
    headers: { 'X-Robots-Tag': 'noindex' },
  },
  { src: '/(.+?)/$', status: 308, headers: { Location: '/$1' } },
);

fs.writeFileSync(file, JSON.stringify(config, null, 2));
