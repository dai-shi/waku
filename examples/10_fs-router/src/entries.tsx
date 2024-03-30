import { fsRouter } from 'waku/router/server';

export default fsRouter(import.meta.url, loader);

declare global {
  interface ImportMeta {
    readonly glob: any;
  }
}

function loader(dir: string, file: string) {
  const fname = `./${dir}/${file.replace(/\.\w+$/, '')}.tsx`;
  const modules = import.meta.glob('./pages/**/*.tsx');
  return modules[fname]();
}
