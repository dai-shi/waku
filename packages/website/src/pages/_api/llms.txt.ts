import { loadGuides, loadReadme } from '../../lib/load-docs';

/**
 * Serves consolidated documentation as plain text for LLMs
 */
export const GET = async () => {
  let readme = loadReadme();
  readme = readme.replace(
    /⛩️ The minimal React framework\n\n[\s\S]*?\n\n## Introduction/,
    '⛩️ The minimal React framework\n\n## Introduction',
  );
  readme = readme.replace(/\n## Community[\s\S]*$/, '\n');
  const guides = (await loadGuides())
    .map(
      (guide) =>
        `# ${guide.title}\n\nSource: https://waku.gg/guides/${guide.slug}\n\n${guide.content.trim()}`,
    )
    .join('\n\n---\n\n');
  return new Response(`${readme}\n# Guides\n\n${guides}`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
