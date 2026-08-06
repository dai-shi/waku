import { loadCreatePages, loadReadme } from './load-docs';

export const loadRoutingFileBased = (): string => {
  const readme = loadReadme();
  const routingSectionMatch = readme.match(
    /^## Routing\n([\s\S]*?)(?=^## [A-Z])/m,
  );
  const routingSection = routingSectionMatch?.[1];
  if (!routingSection) {
    throw new Error('Failed to extract Routing section from README.md.');
  }
  const overviewMatch = routingSection.match(/^### Overview\n+([\s\S]*)/m);
  const contentAfterOverview = overviewMatch?.[1];
  if (!contentAfterOverview) {
    throw new Error('Failed to find "### Overview" in Routing section.');
  }
  return contentAfterOverview.trim();
};

export const loadRoutingConfigBased = (): string => {
  const createPages = loadCreatePages();
  const withoutFrontmatter = createPages.replace(/^---[\s\S]*?---\n*/, '');
  const withoutMainHeading = withoutFrontmatter.replace(
    /^## Routing \(low-level API\)\n*/m,
    '',
  );
  return withoutMainHeading.trim();
};

export const loadBeforeRouting = (): string => {
  const readme = loadReadme();
  const match = readme.match(/(^## Introduction[\s\S]*?)(?=^## Routing)/m);
  const content = match?.[1];
  if (!content) {
    throw new Error('Failed to extract content before Routing section.');
  }
  return content.trim();
};

export const loadAfterRouting = (): string => {
  const readme = loadReadme();
  const match = readme.match(
    /^## Routing[\s\S]*?(^## (?!Routing)[A-Z][\s\S]*)/m,
  );
  const content = match?.[1];
  if (!content) {
    throw new Error('Failed to extract content after Routing section.');
  }
  return content.trim();
};
