import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { connectMiddleware } from 'waku';

const withSsr = process.argv[2] === '--with-ssr';

const root = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cookieParser());
app.use(
  connectMiddleware({
    entries: import(
      pathToFileURL(path.join(root, 'dist', 'entries.js')).toString()
    ),
    unstable_prehook: (req) => {
      return { count: Number(req.orig.cookies.count) || 0 };
    },
    unstable_posthook: (req, res, ctx) => {
      res.orig.cookie('count', String(ctx.count));
    },
    ssr: withSsr,
  }),
);
app.use(express.static(path.join(root, 'dist', 'public')));
express.static.mime.default_type = '';

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.info('Listening on', port);
});
