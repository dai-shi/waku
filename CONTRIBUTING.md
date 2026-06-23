# Contributing to Waku

## Prerequisites

- [Node.js](https://nodejs.org/en/download/): see specific version in [package.json](./package.json)

```shell
corepack enable
pnpm install
```

## Building

Before you start, make sure to build Waku so that the templates can be run.

```shell
pnpm run compile
```

## Start with a template

The `create-waku` starter templates live in the `templates` directory.

```shell
pnpm -F 01_basic dev # to run the default template in dev mode
```

`build` and `start` can be run with the same pattern:

```shell
pnpm -F 01_basic build
pnpm -F 01_basic start
```

More examples can be found in the [waku-examples](https://github.com/wakujs/waku-examples) repository.

## Testing

We are using [playwright](https://playwright.dev/) for end-to-end testing.

```shell
pnpm run e2e
```

## Trying an experimental version

To try an app with an experimental version of Waku, change the `waku` dependency in the app's `package.json` to `"github:<REPO_OWNER>/waku#<GIT_REF>&path:/packages/waku"` and run `pnpm install`. For example:

```json
{
  "dependencies": {
    "waku": "github:your_username/waku#your_branch&path:/packages/waku"
  }
}
```
