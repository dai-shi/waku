# Contributing to waku

## Prerequisites

- [Node.js](https://nodejs.org/en/download/): see specific version in [package.json](./package.json)

```shell
corepack enable
pnpm install
```

## Building

Before you start, make sure to build the waku so that the examples can be run.

```shell
pnpm run compile
```

## Start with example

```shell
pnpm run examples:dev:01_template
```

or if you want to run a specific example:

```shell
cd examples/01_template
pnpm run dev
```

More examples can be found in the `examples` directory.

## Testing

We are using [playwright](https://playwright.dev/) for end-to-end testing.

```shell
pnpm run e2e
```
