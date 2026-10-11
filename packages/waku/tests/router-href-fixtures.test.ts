import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, test } from 'vitest';

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getNewLine: () => ts.sys.newLine,
};

test.each(['generated', 'manual', 'local'])(
  'href factory types compile with %s route metadata',
  { timeout: 60_000 },
  (mode) => {
    const configPath = fileURLToPath(
      new URL(
        `./fixtures/router-href-${mode}-types/tsconfig.json`,
        import.meta.url,
      ),
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
    expect(parsed.fileNames.length).toBeGreaterThan(0);
    const diagnostics = [
      ...parsed.errors,
      ...ts.getPreEmitDiagnostics(
        ts.createProgram(parsed.fileNames, parsed.options),
      ),
    ];
    if (diagnostics.length) {
      throw new Error(ts.formatDiagnostics(diagnostics, formatHost));
    }
  },
);
