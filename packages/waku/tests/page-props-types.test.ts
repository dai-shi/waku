import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { describe, expect, it } from 'vitest';
import type { PageProps } from '../src/router/base-types.js';

// In this suite CreatePagesConfig is not augmented, so PagePath resolves to
// never and PageProps falls back to accepting any string (the pre-codegen
// bootstrap behavior). Rejection of unknown routes after codegen is proven in
// the augmented fs-router fixture (page-props-typing.ts).
describe('PageProps route constraint', () => {
  it('accepts any string before codegen and types its props', () => {
    type Props = PageProps<'/made/up/[foo]'>;
    expectType<TypeEqual<Props['foo'], string>>(true);
    expectType<TypeEqual<Props['path'], `/made/up/${string}`>>(true);
    expectType<TypeEqual<Props['query'], string>>(true);
    const props: Props = { path: '/made/up/x', query: '', foo: 'x' };
    expect(props.foo).toBe('x');
  });
});
