import { build } from 'vite';
import { getDefaultRollupOptions, hiddenPathFromCode } from './utils.js';
import path from 'node:path';
import { rscTransformPlugin } from '../src/lib/plugins/vite-plugin-rsc-transform.js';
import { describe, expect, test } from 'vitest';
import type { RollupOutput } from 'rollup';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL(`./.cache/`, import.meta.url));

async function runTest(environment: 'client' | 'server', inputCode: string) {
  await mkdir(new URL(`./.cache/`, import.meta.url), {
    recursive: true,
  });
  const inputFile = `${createHash('md5')
    .update(inputCode)
    .digest('hex')
    .slice(0, 8)}.ts`;
  const inputFilePath = path.resolve(root, inputFile);
  await writeFile(inputFilePath, inputCode, { encoding: 'utf-8' });
  const output = (await build({
    root: root,
    logLevel: 'silent',
    build: {
      write: false,
      rollupOptions: {
        ...getDefaultRollupOptions(),
        input: inputFilePath,
      },
      ssr: environment === 'server',
    },
    plugins: [
      rscTransformPlugin(
        environment === 'client'
          ? {
              isClient: true,
              isBuild: false,
            }
          : {
              isClient: false,
              isBuild: false,
            },
      ),
    ],
  })) as RollupOutput;
  return output;
}

describe('vite-plugin-rsc-transform', () => {
  test('server-basic.ts', async () => {
    const { output } = await runTest(
      'server',
      `'use server';
export async function foo () {
  return 'foo';
}`,
    );
    expect(output.length).toBe(1);
    expect(hiddenPathFromCode(root, output[0].code)).toMatchInlineSnapshot(`
      "import { registerServerReference } from "react-server-dom-webpack/server";
      async function foo() {
        return "foo";
      }
      if (typeof foo === "function") {
        registerServerReference(foo, "<hidden>/1af46438.ts", "foo");
      }
      export {
        foo
      };
      "
    `);
  });
});
