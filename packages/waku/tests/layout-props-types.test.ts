import type { ReactNode } from 'react';
import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { describe, expect, it } from 'vitest';
import type {
  LayoutProps,
  Unstable_SearchCodec,
} from '../src/router/base-types.js';
import type { PropsForPages } from '../src/router/create-pages-utils/inferred-path-types.js';

// In this suite CreatePagesConfig is not augmented, so LayoutPath resolves to
// never and LayoutProps falls back to accepting any string (the pre-codegen
// behavior, like PageProps). Validation against generated layout paths is proven
// in the augmented fs-router fixture (layout-props-typing.ts). A search codec is
// registered below to prove the layout drops `search` even when a page at the
// same path would receive it.
declare module '../src/router/base-types.js' {
  interface SearchCodecsConfig {
    '/foo/[aaa]': Unstable_SearchCodec<{ q: string }>;
  }
}

describe('LayoutProps', () => {
  it('adds children, derives its own params, and drops path/query/search', () => {
    type Props = LayoutProps<'/foo/[aaa]'>;
    expectType<TypeEqual<Props['children'], ReactNode>>(true);
    expectType<TypeEqual<Props['aaa'], string>>(true);
    expectType<TypeEqual<'path' extends keyof Props ? true : false, false>>(
      true,
    );
    expectType<TypeEqual<'query' extends keyof Props ? true : false, false>>(
      true,
    );
    // parent-path-only scope: a child page param (bbb of /foo/[aaa]/[bbb])
    // never leaks into the layout's props
    expectType<TypeEqual<'bbb' extends keyof Props ? true : false, false>>(
      true,
    );
    // a page at this path receives a typed `search`, but the layout does not
    expectType<TypeEqual<PropsForPages<'/foo/[aaa]'>['search'], { q: string }>>(
      true,
    );
    expectType<TypeEqual<'search' extends keyof Props ? true : false, false>>(
      true,
    );
    const props: Props = { children: null, aaa: 'x' };
    expect(props.aaa).toBe('x');
  });
});
