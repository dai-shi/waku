# README

## Setup

1. init sst `pnpx sst@latest init`
2. replace the generated `./sst.config.ts` with `sst.config.ts`from this folder
3. copy the file `waku.ts` to
   `.sst/platform/src/components/aws/waku.ts`
4. add `export * from "./waku.js";` to `.sst/platform/src/components/aws/index.ts`
5. change to include the deployment adapter `"build" : "waku build --with-aws-lambda"`

> **Optional:** activate streaming with `"build" : "DEPLOY_AWS_LAMBDA_STREAMING=true waku build --with-aws-lambda"`

## Deploy

```sh
pnpm sst deploy
```

## Configuration

see Comments in `.sst/platform/src/components/aws/waku.ts`

## Architecture

- AWS Cloudfront - global CDN and reverse proxy
- AWS Lambda Function - serverless function for the waku framework
- AWS S3 - static assets

Cloudfront can only handle by default 25 behaviors which does not allow to map all folders in the public folder.
The current setup only maps `public/assets` and `public/images` from cloudfront to s3.
The public folder is not included with in the lambda.
