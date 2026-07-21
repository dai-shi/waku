import { describe, expect, it, vi } from 'vitest';
import {
  getHeaders,
  getNonce,
  getRequest,
  getRerender,
  getResolveSearchCodec,
  getRscParams,
  getRscPath,
  runWithRouterStore,
  setNonce,
  setRerender,
  setRscParams,
  setRscPath,
} from '../src/router/define-router-utils/request-store.js';

const makeRequest = (url = 'http://localhost:3000/', init?: RequestInit) =>
  new Request(url, init);

describe('request-store', () => {
  it('getRequest throws outside a router store', () => {
    expect(() => getRequest()).toThrow('Request is not available.');
  });

  it('getRequest returns the current request inside a store', () => {
    const req = makeRequest();
    expect(runWithRouterStore({ req }, () => getRequest())).toBe(req);
  });

  it('getHeaders reads the request headers as a plain object', () => {
    const req = makeRequest('http://localhost:3000/', {
      headers: { 'x-test': 'value' },
    });
    const headers = runWithRouterStore({ req }, () => getHeaders());
    expect(headers['x-test']).toBe('value');
  });

  it('nested async work sees the same request store', async () => {
    const req = makeRequest();
    const seen = await runWithRouterStore({ req }, async () => {
      await Promise.resolve();
      return (async () => {
        await Promise.resolve();
        return getRequest();
      })();
    });
    expect(seen).toBe(req);
  });

  it('rsc path and params can be set and read within one store', () => {
    const req = makeRequest();
    const result = runWithRouterStore({ req }, () => {
      setRscPath('R/foo');
      setRscParams({ query: 'a=1' });
      return { rscPath: getRscPath(), rscParams: getRscParams() };
    });
    expect(result).toEqual({ rscPath: 'R/foo', rscParams: { query: 'a=1' } });
  });

  it('rsc path and params are undefined without a store', () => {
    expect(getRscPath()).toBeUndefined();
    expect(getRscParams()).toBeUndefined();
  });

  it('store state does not leak between two concurrent stores', async () => {
    const run = (req: Request, path: string, delay: number) =>
      runWithRouterStore({ req }, async () => {
        setRscPath(path);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return getRscPath();
      });
    const [a, b] = await Promise.all([
      run(makeRequest('http://localhost:3000/a'), 'A', 20),
      run(makeRequest('http://localhost:3000/b'), 'B', 5),
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });

  it('getRerender throws until a rerender is set, then returns it', () => {
    const req = makeRequest();
    runWithRouterStore({ req }, () => {
      expect(() => getRerender()).toThrow('Rerender is not available.');
      const rerender = vi.fn();
      setRerender(rerender);
      getRerender()('R/x');
      expect(rerender).toHaveBeenCalledWith('R/x');
    });
  });

  it('nonce round-trips within a store', () => {
    const req = makeRequest();
    const nonce = runWithRouterStore({ req }, () => {
      setNonce('nonce-1');
      return getNonce();
    });
    expect(nonce).toBe('nonce-1');
  });

  it('getResolveSearchCodec returns the resolver provided to the store', () => {
    const req = makeRequest();
    const resolveSearchCodec = vi.fn(() => undefined);
    const resolver = runWithRouterStore({ req, resolveSearchCodec }, () =>
      getResolveSearchCodec(),
    );
    expect(resolver).toBe(resolveSearchCodec);
  });

  it('setters are no-ops outside a store', () => {
    expect(() => setRscPath('R/x')).not.toThrow();
    expect(() => setNonce('n')).not.toThrow();
    expect(getRscPath()).toBeUndefined();
  });
});
