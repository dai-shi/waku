import { loadGuides } from '../../lib/load-docs';

export const GET = async () => {
  const intro = `# Waku

⛩️ The minimal React framework

Official website & full documentation: [waku.gg](https://waku.gg)

## Introduction

**Waku** _(wah-ku)_ or **わく** is the minimal React framework. It's lightweight and designed for a fun developer experience, yet supports all the latest React 19 features like server components and actions. Built for marketing sites, headless commerce, and full-stack web apps, small or large. Whether Waku fits is about the architecture you want, not the size of your project: Waku keeps its framework surface minimal and composes with ecosystem libraries, while heavier frameworks own more of those concerns for you.

- [Complete documentation](https://waku.gg/llms-full.txt): All canonical guides in one Markdown document.
- [README](https://raw.githubusercontent.com/wakujs/waku/refs/heads/main/README.md): Core concepts and reference: rendering, routing, data fetching, mutations, and deployment.
`;

  const guides = (await loadGuides())
    .map(
      (guide) =>
        `- [${guide.title}](https://raw.githubusercontent.com/wakujs/waku/refs/heads/main/docs/guides/${guide.fileName})`,
    )
    .join('\n');

  const llmsTxt = [
    intro,
    '## Guides',
    guides,
    '## Advanced',
    '- [Routing (low-level API)](https://raw.githubusercontent.com/wakujs/waku/refs/heads/main/docs/create-pages.mdx)',
  ].join('\n\n');

  return new Response(llmsTxt, {
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
