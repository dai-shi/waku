import { createPages } from 'waku/router/server';

import { ServerEcho } from './ServerEcho.js';
import { ClientEcho } from './ClientEcho.js';

export default createPages(async ({ createPage }) => {
  createPage({
    render: 'dynamic',
    path: '/server/dynamic/[echo]',
    component: ServerEcho,
  });
  createPage({
    render: 'static',
    path: '/server/static/[echo]',
    staticPaths: ['static-echo'],
    component: ServerEcho,
  });
  createPage({
    render: 'dynamic',
    path: '/client/dynamic/[echo]',
    component: ClientEcho,
  });
  createPage({
    render: 'static',
    path: '/client/static/[echo]',
    staticPaths: ['static-echo'],
    component: ClientEcho,
  });
});
