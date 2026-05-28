# ExifReader - Agent Guide

JavaScript library that parses Exif/IPTC/XMP/ICC/MPF metadata from JPEG, TIFF, PNG, HEIC, AVIF, JPEG XL, WebP, and GIF images. Published on npm as `exifreader`.

## Project Structure

- `src/` - ES module source (entry: `exif-reader.js`)
- `test/unit/` - Mocha+Chai unit tests (`*-spec.js`), uses `babel-plugin-rewire` for dependency injection
- `test/types/` - TypeScript type tests for `exif-reader.d.ts`
- `test/integration/` - Integration tests with fixture images
- `test/build/` - Tests verifying the built output
- `dist/` - Webpack UMD bundle (**committed** - required by Bower)
- `bin/` - Build scripts
- `exif-reader.d.ts` - TypeScript type definitions (root level)

Tag definitions live in `src/tag-names-*.js` (keyed by hex tag ID). Each image format has its own `*-tags.js` parser. `src/constants.js` has feature flags for tree-shaking.

## Custom Builds

Users can configure custom builds (via `package.json` `"exifreader"` key) to include/exclude specific formats and tag groups, reducing bundle size. When adding a new image format or metadata group:

1. Add a `USE_<NAME>` flag to `src/constants.js`
2. Add the module name to the `modules` array in `webpack.config.js`
3. Add the source filename to the string-replace regex in `webpack.config.js` (so `Constants.USE_*` gets replaced)
4. Add test entries in `test/build/custom-builds.json`
5. Document the module in the README custom build table

## Commands

| Task | Command |
|---|---|
| Lint | `npm run lint` |
| Unit tests | `npm test` |
| Type tests | `npm run test:types` |
| Coverage | `npm run coverage` |
| Build | `npm run build` |
| Pre-commit suite | `npm run pre-commit` (lint + types + coverage + build test) |
| All tests | `npm run test:all` |

## Before Committing

1. Run `npm run build` - the `dist/` files must be committed (Bower consumes them from the repo).
2. The pre-commit hook (`npm run pre-commit`) runs automatically via Husky and must pass.

## Coding Style

Enforced by ESLint (`.eslintrc.json`). Key rules:

- ES modules (`import`/`export`), no CommonJS in `src/`
- 4-space indent, single quotes, semicolons always
- `const`/`let` only (no `var`), `prefer-const`, strict equality (`===`)
- `object-shorthand`, no `console`, no TODO/FIXME comments
- No curly-brace spacing: `{a, b}` not `{ a, b }`
- Arrow parens always: `(x) => x`
- Space before anonymous function paren, not named: `function foo()` vs `function ()`
- kebab-case filenames, camelCase variables/functions, PascalCase constructors/class-like exports
- Place functions in the order they are used. That means the definition of a function is placed after the location from where it is called.

## Older runtime support (src/ only)

The browserslist target includes IE10 and other older runtimes. The
build pipeline transpiles down to a low ECMAScript baseline, and a few
modern constructs balloon the output. Avoid them in `src/`:

- **No `async`/`await` keywords.** They transpile to a regenerator
  runtime that adds significant bundle size. Use explicit promise
  chains (`Promise.resolve(...).then(...)`) instead.
- **No object spread (`{...obj, key: value}`) and no `Object.assign`.**
  Use `objectAssign(target, ...sources)` from `src/utils.js` instead.
  Example: `const next = objectAssign({}, options, {async: true});`.

`test/`, `bin/`, and `webpack.config.js` run only in modern Node on
maintainer machines, so they may use any modern syntax.

## Comments

Prefer self-explaining code (clear names, small functions) over comments. Add a comment only when the code cannot be made obvious on its own, for example a non-trivial spec reference, a workaround for a known quirk, or a subtle invariant.

When a comment is warranted, keep it short and to the point. One or two lines is usually enough.

JSDoc is welcome on exported functions where it documents the contract (parameters, return shape). Keep it concise and skip restating what the signature already says.

## Type Definitions

This is **not** a TypeScript project, but `exif-reader.d.ts` provides types for consumers. When adding or changing public API surface (new tags, options, return types):

1. Update `exif-reader.d.ts`
2. Update `test/types/exif-reader.ts` with type-level tests (including `@ts-expect-error` for invalid usage)
3. Verify with `npm run test:types`

## Tests

Every source file has a corresponding `test/unit/*-spec.js`. New code needs tests. Coverage thresholds are enforced.

Tests use `babel-plugin-rewire` to mock dependencies (e.g., `__Rewire__`/`__ResetDependency__`). Follow existing test patterns.

Use `npm run test` to run the unit tests and make use of `describe.only` and `it.only` for focused testing.

### TDD: red-green-refactor

Write code test-first. For each new behavior:

1. **Red** — write the smallest failing test that captures the next bit of behavior. Run it and watch it fail for the expected reason (missing function, wrong return, etc.).
2. **Green** — write the smallest change in `src/` that makes the test pass. Resist adding anything the test doesn't demand.
3. **Refactor** — with tests green, tidy names, extract helpers, remove duplication. Re-run the suite after each change.

Cycle one behavior at a time, not one feature. A feature like "parse iloc constructionMethod 1" is many cycles (parse the idat box; resolve a single-extent cm-1 offset; handle a missing idat box; etc.), each one a red-green-refactor turn.

## Changelog

When making notable changes (new features, bug fixes, breaking changes, etc.), add an entry to the `Unreleased` section in `CHANGELOG.md`. Use the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format with the appropriate change type: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, or `Security`.

## Adding Tags

1. Add hex-keyed entry in the appropriate `src/tag-names-*-ifd.js`
2. Add description function if needed (see `src/tag-names-common.js` for helpers)
3. Add unit test in corresponding `test/unit/tag-names-*-spec.js`
4. Update `exif-reader.d.ts` and `test/types/exif-reader.ts` if the tag is user-facing
