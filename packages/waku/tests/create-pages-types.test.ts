import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { test } from 'vitest';

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getNewLine: () => ts.sys.newLine,
};

test('createPages route types compile without circular inference', () => {
  const mainDts = fileURLToPath(new URL('../dist/main.d.ts', import.meta.url));
  if (!existsSync(mainDts)) {
    throw new Error('Run `pnpm -F waku run compile` before this test.');
  }
  const configPath = fileURLToPath(
    new URL('./fixtures/create-pages-types/tsconfig.json', import.meta.url),
  );
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(ts.formatDiagnostic(config.error, formatHost));
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(configPath),
  );
  if (parsed.errors.length) {
    throw new Error(ts.formatDiagnostics(parsed.errors, formatHost));
  }
  const diagnostics = ts.getPreEmitDiagnostics(
    ts.createProgram(parsed.fileNames, parsed.options),
  );
  if (diagnostics.length) {
    throw new Error(ts.formatDiagnostics(diagnostics, formatHost));
  }
});
