import { createPages } from 'waku';

import { getPokemonPaths } from './lib/index.js';
import { RootLayout } from './templates/root-layout.js';
import { HomePage } from './templates/home-page.js';
import { PokemonPage } from './templates/pokemon-page.js';

export default createPages(async ({ createPage, createLayout }) => {
  createLayout({
    render: 'static',
    path: '/',
    component: RootLayout,
  });

  createPage({
    render: 'dynamic',
    path: '/',
    component: HomePage,
  });

  const pokemonPaths = await getPokemonPaths();

  createPage({
    render: 'static',
    path: '/[slug]',
    component: PokemonPage,
    staticPaths: pokemonPaths,
  });
});
