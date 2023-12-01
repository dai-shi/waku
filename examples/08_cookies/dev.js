import express from 'express';
import cookieParser from 'cookie-parser';
import { rsc, connectWrapper } from 'waku';

const withSsr = process.argv[2] === '--with-ssr';

const app = express();
app.use(cookieParser());
app.use(
  connectWrapper(
    rsc({
      command: 'dev',
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.info('Listening on', port);
});
