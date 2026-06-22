import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { describe, expect, it } from 'vitest';
import { getPathMapping, parsePathWithSlug } from '../src/lib/utils/path.js';
import type { ApiContext } from '../src/router/create-pages-utils/inferred-path-types.js';

/**
 * Tests for ApiContext<Path> - typed API route parameters
 *
 * ApiContext provides a typed `params` property that extracts route parameters
 * from the path pattern. It is passed as the second argument to API handlers.
 *
 * @see https://github.com/wakujs/waku/issues/1906
 */

describe('ApiContext params type tests', () => {
  it('extracts single slug parameter', () => {
    type Params = ApiContext<'/users/[id]'>['params'];
    expectType<TypeEqual<Params, { id: string }>>(true);
  });

  it('extracts multiple slug parameters', () => {
    type Params = ApiContext<'/users/[userId]/posts/[postId]'>['params'];
    expectType<TypeEqual<Params, { userId: string; postId: string }>>(true);
  });

  it('extracts wildcard parameter as string array', () => {
    type Params = ApiContext<'/files/[...path]'>['params'];
    expectType<TypeEqual<Params, { path: string[] }>>(true);
  });

  it('extracts mixed slug and wildcard parameters', () => {
    type Params = ApiContext<'/users/[id]/files/[...path]'>['params'];
    expectType<TypeEqual<Params, { id: string; path: string[] }>>(true);
  });

  it('returns empty object for paths without parameters', () => {
    type Params = ApiContext<'/users'>['params'];

    expectType<TypeEqual<Params, {}>>(true);
  });

  it('handles root path', () => {
    type Params = ApiContext<'/'>['params'];

    expectType<TypeEqual<Params, {}>>(true);
  });

  it('handles nested paths with single parameter', () => {
    type Params = ApiContext<'/api/v1/items/[itemId]'>['params'];
    expectType<TypeEqual<Params, { itemId: string }>>(true);
  });

  it('handles wildcard at root level', () => {
    type Params = ApiContext<'/[...slug]'>['params'];
    expectType<TypeEqual<Params, { slug: string[] }>>(true);
  });
});

describe('ApiContext type tests', () => {
  it('has typed params for single slug', () => {
    type Ctx = ApiContext<'/users/[id]'>;

    // Should have params property
    expectType<Ctx['params']>({ id: 'test-id' });

    // Params should be correctly typed
    type ParamsType = Ctx['params'];
    expectType<TypeEqual<ParamsType, { id: string }>>(true);
  });

  it('has typed params for multiple slugs', () => {
    type Ctx = ApiContext<'/users/[userId]/posts/[postId]'>;

    expectType<Ctx['params']>({ userId: 'user-1', postId: 'post-1' });

    type ParamsType = Ctx['params'];
    expectType<TypeEqual<ParamsType, { userId: string; postId: string }>>(true);
  });

  it('has typed params for wildcard', () => {
    type Ctx = ApiContext<'/files/[...path]'>;

    expectType<Ctx['params']>({ path: ['folder', 'subfolder', 'file.txt'] });

    type ParamsType = Ctx['params'];
    expectType<TypeEqual<ParamsType, { path: string[] }>>(true);
  });

  it('has typed params for mixed slug and wildcard', () => {
    type Ctx = ApiContext<'/users/[id]/files/[...path]'>;

    expectType<Ctx['params']>({ id: 'user-1', path: ['docs', 'readme.md'] });

    type ParamsType = Ctx['params'];
    expectType<TypeEqual<ParamsType, { id: string; path: string[] }>>(true);
  });

  it('has empty params object for paths without parameters', () => {
    type Ctx = ApiContext<'/users'>;

    expectType<Ctx['params']>({});

    type ParamsType = Ctx['params'];

    expectType<TypeEqual<ParamsType, {}>>(true);
  });
});

describe('ApiContext usage patterns', () => {
  it('works with destructuring in handler', () => {
    const handler = async (
      _req: Request,
      { params }: ApiContext<'/posts/[postId]/comments/[commentId]'>,
    ) => {
      const { postId, commentId } = params;
      expectType<string>(postId);
      expectType<string>(commentId);
      return new Response(`Post ${postId}, Comment ${commentId}`);
    };

    expectType<
      (
        req: Request,
        ctx: ApiContext<'/posts/[postId]/comments/[commentId]'>,
      ) => Promise<Response>
    >(handler);
  });

  it('works with wildcard destructuring', () => {
    const handler = async (
      _req: Request,
      { params }: ApiContext<'/api/[...segments]'>,
    ) => {
      const { segments } = params;
      expectType<string[]>(segments);
      return new Response(`Segments: ${segments.join('/')}`);
    };

    expectType<
      (req: Request, ctx: ApiContext<'/api/[...segments]'>) => Promise<Response>
    >(handler);
  });

  it('allows accessing both Request properties and params', () => {
    const handler = async (
      req: Request,
      { params }: ApiContext<'/users/[id]'>,
    ) => {
      const url = new URL(req.url);
      const { id } = params;
      const authHeader = req.headers.get('Authorization');

      expectType<string>(id);
      expectType<URL>(url);
      expectType<string | null>(authHeader);

      return new Response(JSON.stringify({ id, path: url.pathname }));
    };

    expectType<
      (req: Request, ctx: ApiContext<'/users/[id]'>) => Promise<Response>
    >(handler);
  });

  it('keeps Request as a plain Request type', () => {
    // The handler receives a standard Request, not a modified one
    const handler = async (
      req: Request,
      { params }: ApiContext<'/users/[id]'>,
    ) => {
      // Should have access to standard Request properties
      expectType<string>(req.url);
      expectType<string>(req.method);
      expectType<Headers>(req.headers);
      expectType<ReadableStream<Uint8Array> | null>(req.body);

      // Should have access to standard Request methods
      expectType<Request>(req.clone());
      expectType<Promise<string>>(req.text());
      expectType<Promise<unknown>>(req.json());
      expectType<Promise<ArrayBuffer>>(req.arrayBuffer());

      // Params come from ApiContext, not from req
      const { id } = params;
      expectType<string>(id);

      return new Response(`User: ${id}`);
    };

    expectType<
      (req: Request, ctx: ApiContext<'/users/[id]'>) => Promise<Response>
    >(handler);
  });
});

describe('Runtime params extraction', () => {
  it('extracts single slug parameter', () => {
    const pathSpec = parsePathWithSlug('/users/[id]');
    const params = getPathMapping(pathSpec, '/users/123');
    expect(params).toEqual({ id: '123' });
  });

  it('extracts multiple slug parameters', () => {
    const pathSpec = parsePathWithSlug('/users/[userId]/posts/[postId]');
    const params = getPathMapping(pathSpec, '/users/abc/posts/xyz');
    expect(params).toEqual({ userId: 'abc', postId: 'xyz' });
  });

  it('extracts wildcard parameter as array', () => {
    const pathSpec = parsePathWithSlug('/files/[...path]');
    const params = getPathMapping(pathSpec, '/files/folder/subfolder/file.txt');
    expect(params).toEqual({ path: ['folder', 'subfolder', 'file.txt'] });
  });

  it('extracts mixed slug and wildcard parameters', () => {
    const pathSpec = parsePathWithSlug('/users/[id]/files/[...path]');
    const params = getPathMapping(
      pathSpec,
      '/users/user-1/files/docs/readme.md',
    );
    expect(params).toEqual({ id: 'user-1', path: ['docs', 'readme.md'] });
  });

  it('returns empty object for paths without parameters', () => {
    const pathSpec = parsePathWithSlug('/users');
    const params = getPathMapping(pathSpec, '/users');
    expect(params).toEqual({});
  });

  it('handles empty wildcard', () => {
    const pathSpec = parsePathWithSlug('/[...slug]');
    const params = getPathMapping(pathSpec, '/');
    expect(params).toEqual({ slug: [] });
  });
});
