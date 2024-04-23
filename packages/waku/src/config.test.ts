import { test, expect } from 'vitest';
import { type Config, defineConfig } from 'waku/config';
import { expectType } from 'ts-expect';

// Absolutely meaningless unit and type test examples.
// Only exist to proof that the frameworks are set up correctly.
test('defineConfig', async () => {
  expect(defineConfig({})).toEqual({});
});

expectType<Config>(defineConfig({}));

// @ts-expect-error This is supposed to verify ts-expect works.
expectType<undefined>(defineConfig({}));
