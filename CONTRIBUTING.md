# Contributing to Waku

## Prerequisites

- [Node.js](https://nodejs.org/en/download/): see the supported versions in
  [packages/waku/package.json](./packages/waku/package.json)
- [pnpm](https://pnpm.io/installation): see the version in
  [package.json](./package.json)

```shell
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

Run the checks relevant to your changes:

```shell
pnpm run compile
pnpm run test:unit
pnpm run test:lint
pnpm exec playwright install --with-deps
pnpm run e2e
```

End-to-end tests use [Playwright](https://playwright.dev/).

## Trying an experimental version

To try an app with an experimental version of Waku, change the `waku` dependency in the app's `package.json` to `"github:<REPO_OWNER>/waku#<GIT_REF>&path:/packages/waku"` and run `pnpm install`. For example:

```json
{
  "dependencies": {
    "waku": "github:your_username/waku#your_branch&path:/packages/waku"
  }
}
```

---

## Coding rules and conventions

In short, keep changes focused and code direct. Prefer fewer concepts, respect
existing module boundaries, and preserve observable behavior. Public APIs need
explicit types and useful JSDoc; implementation details should generally rely
on inference and avoid narrating comments. Add focused tests for changed
behavior.

Unstable APIs use `_UNSTABLE` for React components, hooks, and contexts,
`Unstable_` for TypeScript types, and `unstable_` for other values and
functions. A deprecated alias keeps the name it shipped with; the
convention applies to the name an API is introduced under.

### For AI agents

If you use a coding agent, configure your local instruction file, such as
`AGENTS.md`, to tell the agent to read this file. Treat the rules below as hard
constraints, not style tips. Here, compression means reducing the concepts a
reader must hold in mind, not making code terse or public documentation
incomplete.

### Scope and design

- Fix behavior in the layer that owns it. Do not spread a special case across
  unrelated modules.
- Keep changes focused. Do not combine a bug fix with an unrelated refactor.
  Prefer a readable diff over either the fewest changed lines or a broad
  cleanup.
- Do not expand the task to improve nearby code. Within production code already
  being changed, fix trivial misleading names or bindings and remove misleading
  or redundant comments. In tests, avoid unrelated cleanup.
- Do not add a public option, generic abstraction, or compatibility layer for
  one exceptional case.
- Prefer fewer concepts. Every new name, file, or type should represent a
  distinction the code needs, not make the design look complete or symmetric.
- Split a module only at a real boundary, not to move one small helper into its
  own file.
- Preserve existing ordering and other observable contracts unless changing
  them is the purpose of the change.
- Validate external input at its boundary. Do not add speculative guards for
  states already excluded by internal types or invariants.
- Keep Waku core independent from Waku Router. Router-specific integration in
  core should be exceptional and narrowly scoped.
- Keep platform-specific behavior in adapters. Do not import Node APIs into
  browser or isomorphic modules.

### Implementation

- Prefer direct control flow, early returns, and native platform APIs.
- Use `const` unless a binding must be reassigned. Local mutation of an array,
  map, set, or result object is fine when it makes the algorithm clearer.
- Name functions with verbs. Do not create a wrapper that only supplies fixed
  arguments to another function.
- Name operations and results, not stages in the control flow. Avoid helpers and
  variables that only narrate the current step.
- Extract a helper when it owns a meaningful operation or invariant, not merely
  to shorten the caller.
- Do not add refs, contexts, locks, or other coordination state that only
  narrates existing control flow.
- Prefer an early return or thrown error to an outcome union that is consumed
  only once. Use a discriminated union when callers actually branch on its
  states.
- Prefer plain functions and objects. Use a class only when required by a
  framework or platform contract.
- Use recursion when the problem is naturally recursive and the call depth is
  safe.
- Await or return promises. Do not leave asynchronous work floating.
- Normalize configuration and optional inputs once near the boundary.

### TypeScript

- Prefer inference for local implementation details and explicit types for
  public contracts or important boundaries.
- Prefer `unknown` to `any`. Narrow values before using them.
- Prefer type aliases. Use interfaces when declaration merging or augmentation
  is required.
- Keep casts narrow and close to third-party or framework boundaries. Do not
  weaken types throughout the caller to satisfy one integration point.
- Use `import type` for type-only imports.

### Comments and documentation

Before adding a comment, look for a better home, in this order:

1. A name: rename the binding, constant, or function, or split the function.
2. A test: an edge case that a regression test pins down needs no comment.
3. A guide: motivation and design belong in the docs.
4. The commit message: anything about how the code changed.

- Comment only what none of these homes can carry. A comment explains code
  that exists: why this branch exists, which invariant the code next to it
  relies on, or which external behavior forces a workaround. Fitting one of
  these is required, not sufficient.
- Do not explain code that is not there. Why something was removed or is not
  done belongs in the commit message, and a regression test should guard it.
- Write for the code as it stands. Read the comment as someone who never saw
  the previous version: words like "either", "still", "no longer", "instead",
  or "like any other" mean it describes the change, not the code.
- Keep a comment to one line, rarely two. A comment that needs a paragraph
  belongs in one of the homes above.
- The rules above apply equally to tests, fixtures, and e2e specs.
- Do not restate a name or type, in a comment or in JSDoc, and do not repeat
  the same fact in multiple places.
- `TODO`, `FIXME`, and `HACK` are acceptable when they describe an unresolved
  issue. Remove them only when the issue is actually resolved.
- Public APIs should have complete JSDoc suitable for editor documentation.
  Cover the behavior, parameters, return values, caveats, and examples needed to
  use the API correctly, in as few lines as that takes. A caller should be able
  to read it in one pass. Explain what a caller must know, not how the
  implementation arrives there. Documentation that grows past a screenful
  usually means the API needs splitting rather than more prose.
- Public unstable APIs should have the same useful editor documentation as
  other public APIs.
- An exported symbol is not necessarily a public API. JSDoc is editor
  documentation for callers, so a symbol no public entry point exposes gets
  none; comment it like any other code.
- An export that exists only for tests says so in its name.

### Tests

- Reproduce a reported bug before describing it as confirmed.
- Every regression test must fail when its production fix is removed.
- Test observable behavior. Prefer a real existing fixture or integration
  boundary to a loose mock.
- Prefer a few cases at important behavioral boundaries to a scenario matrix
  that mirrors implementation branches.
- Do not change an existing assertion merely to make a new fixture case fit.
