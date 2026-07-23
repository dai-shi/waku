import { ChildProcess, exec } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect } from '@playwright/test';
import {
  getAvailablePort,
  runShell,
  terminate,
  test,
  waitForPortReady,
} from './utils.js';

const execAsync = promisify(exec);

const websiteDir = fileURLToPath(
  new URL('../packages/website', import.meta.url),
);
const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);
const guidesDir = fileURLToPath(new URL('../docs/guides', import.meta.url));

const loadGuide = (fileName: string) => {
  const source = readFileSync(`${guidesDir}/${fileName}`, 'utf8').replace(
    /\r\n?/g,
    '\n',
  );
  const frontmatterMatch = source.match(
    /^---\n(?<frontmatter>[\s\S]*?)\n---\n*/,
  );
  const frontmatter = frontmatterMatch?.groups?.frontmatter;
  const slug = frontmatter
    ?.match(/^slug: (?<value>.+)$/m)
    ?.groups?.value?.trim();
  const title = frontmatter
    ?.match(/^title: (?<value>.+)$/m)
    ?.groups?.value?.trim();
  if (!frontmatterMatch || !slug || !title) {
    throw new Error(`Invalid guide frontmatter: ${fileName}`);
  }
  return {
    slug,
    title,
    content: source.slice(frontmatterMatch[0].length).trim(),
  };
};

test.describe('website smoke test', () => {
  let port: number;
  let cp: ChildProcess;

  test.beforeAll(async ({ mode }) => {
    if (mode === 'PRD') {
      rmSync(`${websiteDir}/dist`, { recursive: true, force: true });
      await execAsync(`node ${waku} build`, { cwd: websiteDir });
    }
    port = await getAvailablePort();
    const command = mode === 'DEV' ? `node ${waku} dev` : `node ${waku} start`;
    cp = runShell(`${command} --port ${port}`, websiteDir);
    await waitForPortReady(port);
  });

  test.afterAll(async () => {
    await terminate(cp);
  });

  test('serves the website home page', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect.poll(() => page.title()).toMatch(/^Waku/);
  });

  test('serves the README and all guides for LLMs', async ({ request }) => {
    const response = await request.get(`http://localhost:${port}/llms.txt`);
    expect(response.ok()).toBe(true);

    const content = await response.text();
    expect(content).toContain('# Waku');

    const guideFileNames = readdirSync(guidesDir, {
      recursive: true,
      encoding: 'utf8',
    }).filter((fileName) => fileName.endsWith('.mdx'));

    for (const fileName of guideFileNames) {
      const { slug, title, content: guideContent } = loadGuide(fileName);
      const guide = `# ${title}\n\nSource: https://waku.gg/guides/${slug}\n\n${guideContent}`;
      expect(content).toContain(guide);
    }

    expect(content.indexOf('# Quick Start\n')).toBeLessThan(
      content.indexOf('# What is Waku?\n'),
    );
  });
});
