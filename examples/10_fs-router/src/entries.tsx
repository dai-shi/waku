import { fsRouter } from 'waku/router/server';

export default fsRouter(import.meta.url, loader);

function loader(dir: string, file: string) {
  const p = file.replace(/\.\w+$/, '').split('/');
  switch (p.length) {
    case 1:
      return import(`./${dir}/${p[0]}.tsx`);
    case 2:
      return import(`./${dir}/${p[0]}/${p[1]}.tsx`);
    case 3:
      return import(`./${dir}/${p[0]}/${p[1]}/${p[2]}.tsx`);
    case 4:
      return import(`./${dir}/${p[0]}/${p[1]}/${p[2]}/${p[3]}.tsx`);
    case 5:
      return import(`./${dir}/${p[0]}/${p[1]}/${p[2]}/${p[3]}/${p[5]}.tsx`);
    default:
      throw new Error('too deep');
  }
}
