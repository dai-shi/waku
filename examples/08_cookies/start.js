import url from 'node:url';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { rsc, connectWrapper } from 'waku';

const withSsr = process.argv[2] === '--with-ssr';

const config = { rootDir: process.cwd() };

const root = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  'dist',
);

const app = express();
app.use(cookieParser());
app.use(
  connectWrapper(
    rsc({
      config,
      command: 'start',
      unstable_prehook: (req) => {
        return { count: Number(req.orig.cookies.count) || 0 };
      },
      unstable_posthook: (req, res, ctx) => {
        res.orig.cookie('count', String(ctx.count));
      },
      ssr: withSsr,
    }),
  ),
);
app.use(express.static(path.join(root, 'public')));
express.static.mime.default_type = '';

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.info('Listening on', port);
});
