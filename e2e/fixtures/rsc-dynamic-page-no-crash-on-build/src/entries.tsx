import { createPages } from 'waku';

import { MainPage } from './templates/main-page.js';

export default createPages(async ({ createPage }) => {
  createPage({
    render: 'dynamic',
    path: '/',
    component: MainPage,
  });
});
