import { createHighlighter } from 'shiki';

import theme from '../theme.json';

const highlighter = createHighlighter({
  langs: ['tsx'],
  themes: [theme as any],
});

export const codeToHtml = async (code: string, options: any) =>
  (await highlighter).codeToHtml(code, options);
