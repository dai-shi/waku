import { getHighlighter } from 'shiki';

import theme from '../theme.json';

const highlighter = getHighlighter({
  langs: ['tsx'],
  themes: [theme as any],
});

export const codeToHtml = async (code: string, options: any) =>
  (await highlighter).codeToHtml(code, options);
