import { Link } from 'waku';
import { cacheRsc } from '../lib/waku-cache.js';

// Incremented only on an actual render; a cache hit reuses the prior element,
// so the visible number stays put until the cache key is invalidated.
let renderCount = 0;

const CachedContent = () => {
  ++renderCount;
  return (
    <div>
      <h1>Cached</h1>
      <p data-testid="cached-content">cached render #{renderCount}</p>
      <p>
        <Link to="/" data-testid="to-home">
          Go home
        </Link>
      </p>
    </div>
  );
};

const { Component, getEtag } = cacheRsc(CachedContent, () => 'cached-page');

export default Component;

export const getConfig = () => {
  return {
    render: 'dynamic',
    unstable_getEtag: getEtag,
  } as const;
};
