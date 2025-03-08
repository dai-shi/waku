import { unstable_fsRouter as fsRouter } from 'waku/router/server';

declare global {
  interface ImportMeta {
    readonly glob: any;
  }
}

export default fsRouter(
  import.meta.url,
  (file: string) =>
    import.meta.glob('./pages/**/*.{tsx,ts}')[`./pages/${file}`]?.(),
  { pagesDir: 'pages', apiDir: 'api' },
);
