import { getHighlighter } from 'shiki';

import theme from '../theme.json';

export const highlighter: any = await getHighlighter({
  langs: ['tsx'],
  themes: [theme as any],
});
