import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { describe, it } from 'vitest';

// Reproduce the AllowPathDecorators type from router/client.tsx to test it directly
type AllowTrailingSlash<Path extends string> = Path extends '/'
  ? Path
  : Path | `${Path}/`;

type AllowPathDecorators<Path extends string> = Path extends unknown
  ? | AllowTrailingSlash<Path>
    | `${AllowTrailingSlash<Path>}?${string}`
    | `${AllowTrailingSlash<Path>}#${string}`
    | `?${string}`
    | `#${string}`
  : never;

describe('AllowPathDecorators', () => {
  it('allows bare paths', () => {
    type Result = AllowPathDecorators<'/' | '/foo'>;
    expectType<TypeEqual<'/' extends Result ? true : false, true>>(true);
    expectType<TypeEqual<'/foo' extends Result ? true : false, true>>(true);
    expectType<TypeEqual<'/foo/' extends Result ? true : false, true>>(true);
  });

  it('allows paths with query strings', () => {
    type Result = AllowPathDecorators<'/' | '/foo'>;
    expectType<TypeEqual<'/?key=val' extends Result ? true : false, true>>(
      true,
    );
    expectType<TypeEqual<'/foo?key=val' extends Result ? true : false, true>>(
      true,
    );
    expectType<TypeEqual<'/foo/?key=val' extends Result ? true : false, true>>(
      true,
    );
  });

  it('allows paths with hash fragments', () => {
    type Result = AllowPathDecorators<'/' | '/foo'>;
    expectType<TypeEqual<'/#section' extends Result ? true : false, true>>(
      true,
    );
    expectType<TypeEqual<'/foo#section' extends Result ? true : false, true>>(
      true,
    );
    expectType<TypeEqual<'/foo/#section' extends Result ? true : false, true>>(
      true,
    );
  });

  it('allows bare query strings without a path prefix', () => {
    type Result = AllowPathDecorators<'/' | '/foo'>;
    // These are relative query/hash navigations — they should be valid
    expectType<TypeEqual<'?count=1' extends Result ? true : false, true>>(true);
  });

  it('allows bare hash fragments without a path prefix', () => {
    type Result = AllowPathDecorators<'/' | '/foo'>;
    expectType<TypeEqual<'#section' extends Result ? true : false, true>>(true);
  });
});
