import { describe, it, expect } from 'vitest';
import { treeshake, removeObjectProperty } from '../src/lib/utils/treeshake.js';

describe('treeshake', () => {
  it('should emit the original code', async () => {
    const code = `
import { fileURLToPath } from 'node:url';

export function foo() {
  console.log(fileURLToPath(new URL('.', import.meta.url)))
}
`;
    expect(await treeshake(code)).toMatchInlineSnapshot(`
      "import { fileURLToPath } from 'node:url';

      function foo() {
          console.log(fileURLToPath(new URL('.', import.meta.url)));
      }

      export { foo };
      "
    `);
  });

  it('should emit with unknown module', async () => {
    const code = `
import { bar } from 'something-unknown';

export function foo() {
  bar();
}
`;
    expect(await treeshake(code)).toMatchInlineSnapshot(`
      "import { bar } from 'something-unknown';

      function foo() {
          bar();
      }

      export { foo };
      "
    `);
  });

  it('should remove unused module', async () => {
    const code = `
import { bar } from 'something-unknown';

export function foo() {
  // bar();
}
`;
    expect(await treeshake(code)).toMatchInlineSnapshot(`
      "function foo() {}

      export { foo };
      "
    `);
  });

  it('should work with types', async () => {
    const code = `
import { bar } from 'something';

export function foo(str: string) {
  bar(str);
}
`;
    expect(await treeshake(code)).toMatchInlineSnapshot(`
      "import { bar } from 'something';

      function foo(str) {
          bar(str);
      }

      export { foo };
      "
    `);
  });
});

describe('treeshake with modification', () => {
  it('should remove a property', async () => {
    const code = `
export function foo() {
  return {
    foo: 1,
    toRemove: 2,
  }
}
`;
    expect(await treeshake(code, removeObjectProperty('toRemove')))
      .toMatchInlineSnapshot(`
      "function foo() {
          return {
              foo: 1
          };
      }

      export { foo };
      "
    `);
  });
});
