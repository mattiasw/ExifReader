# ExifReader - Agent Guide

JavaScript library that parses Exif/IPTC/XMP/ICC/MPF metadata from JPEG, TIFF, PNG, HEIC, AVIF, JPEG XL, WebP, and GIF images. Published on npm as `exifreader`.

## Project Structure

- `src/` - ES module source (entry: `exif-reader.js`)
- `test/unit/` - Mocha+Chai unit tests (`*-spec.js`), run as native ES modules
- `test/types/` - TypeScript type tests for `exif-reader.d.ts`
- `test/integration/` - Integration tests with fixture images
- `test/build/` - Tests verifying the built output
- `dist/` - Webpack UMD bundle (**committed** - required by Bower)
- `bin/` - Build scripts
- `exif-reader.d.ts` - TypeScript type definitions (root level)
- `CLAUDE.md` - only imports `AGENTS.md` (the single line `@AGENTS.md`); `test/unit/agent-instructions-spec.js` keeps it that way, so put instructions for agents and contributors in `AGENTS.md`

Tag definitions live in `src/tag-names-*.js` (keyed by hex tag ID). Each image format has its own `*-tags.js` parser. `src/constants.js` has feature flags for tree-shaking.

## Custom Builds

Users can configure custom builds (via `package.json` `"exifreader"` key) to include/exclude specific formats and tag groups, reducing bundle size. When adding a new image format or metadata group:

1. Add a `USE_<NAME>` flag to `src/constants.js`
2. Add the module name to the `modules` array in `bin/parse-config.js`
3. Read the new flag only in `src/exif-reader.js`, the file the string-replace regex in `webpack.config.js` covers (so `Constants.USE_*` gets replaced). A new module never reads `Constants` itself; it takes its gating from the orchestrator as an argument
4. Add test entries in `test/build/custom-builds.json`
5. Document the module in the README custom build table
6. For the composable API: add the module under `src/composable/formats/` or `src/composable/groups/`, export it from `src/composable/formats.js` or `groups.js` and its `.d.ts`, place it in the order lists in `src/composable/composition.js`, list it behind its flag in `getDefaultTables()` in `src/exif-reader.js` (and in `getEnvironment()` there when it needs the DOM parser getter or the base64 helper), and add it to the README subpath table; a new tag module under `src/composable/tags/` also needs its own entry in `exports` and in `typesVersions` in `package.json`

## Commands

| Task | Command |
|---|---|
| Lint | `npm run lint` |
| Unit tests | `npm test` |
| Type tests | `npm run test:types` |
| Coverage | `npm run coverage` |
| Build | `npm run build` |
| Validate (what the pre-push hook runs) | `npm run validate` (lint + types + coverage + build test) |
| All tests (E2Es need the local server running with `npm run start`) | `npm run test:all` |
| Bundle-size gate (a CI job, not part of the pre-push hook) | `npm run test:bundle-size` |

`test/bundle-size/baseline.json` holds fixed numbers: the v4.55.1 full bundle and each consumer's gzip floor. The gate fails when a bundle is more than a few percent over its number. Changing the file is a commit of its own and needs no CHANGELOG entry. Never re-baseline against the previous commit.

## Before Committing

1. Run `npm run build` - the `dist/` files must be committed (Bower consumes them from the repo).
2. Run `npm run validate` before you hand work over or open a pull request. Husky runs it at `git push` (the pre-push hook), not at each commit, so a commit that went through does not show that it passes.

## Pushing and Pull Requests

Make changes on a topic branch, not on `main`.

Do not push a branch or commits, and do not open a pull request, unless asked to in the current conversation. Preparing a branch for one is fine. Nothing here should reach the remote without the person you are working with knowing about it.

## Coding Style

Enforced by ESLint (`eslint.config.mjs`). Key rules:

- ES modules (`import`/`export`), no CommonJS in `src/`
- 4-space indent, single quotes, semicolons always
- `const`/`let` only (no `var`), `prefer-const`, strict equality (`===`)
- `object-shorthand`, no `console`, no TODO/FIXME comments
- No curly-brace spacing: `{a, b}` not `{ a, b }`
- Arrow parens always: `(x) => x`
- Space before anonymous function paren, not named: `function foo()` vs `function ()`
- kebab-case filenames, camelCase variables/functions, PascalCase constructors/class-like exports
- Place functions in the order they are used. That means the definition of a function is placed after the location from where it is called.

Every `.js` and `.ts` file in `src/`, `bin/` and `test/`, and `exif-reader.d.ts`, starts with the MPL 2.0 license header, after the shebang line if there is one. The linter does not check it, so copy the three-line version from an existing file such as `src/tags.js`.

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

When an exported function warrants documentation, use JSDoc (not a plain comment) to describe its contract: parameters and return shape. Keep it concise and skip restating what the signature already says.

## Type Definitions

This is **not** a TypeScript project, but `exif-reader.d.ts` provides types for consumers. When adding or changing public API surface (new tags, options, return types):

1. Update `exif-reader.d.ts`
2. Update `test/types/exif-reader.ts` with type-level tests (including `@ts-expect-error` for invalid usage)
3. Verify with `npm run test:types`

The types of the composable subpaths are tested in `test/types/packed/composable.mts`. `npm run test:types` does not compile it; `npm run test:build` does, against the packed package.

## Tests

Every source file has a corresponding `test/unit/*-spec.js`. New code needs tests. Coverage thresholds are enforced (via `c8`, configured in `package.json`).

Unit tests run as native ES modules with no transpilation. Develop on Node 24.7+ to be able to run the full suite: the integration and build test suites parse JPEG XL fixtures that need its Brotli support, and they `require()` the ES module source which needs at least 22.12. Relative imports in test files must carry explicit `.js` extensions, and named imports from `src/` modules must actually exist (most `src/` modules only have a default export).

There is no module-mocking library, and none should be introduced. To isolate a module from its dependencies:

- Swap properties on a shared default-export object (`Constants`, `TagNames`, module API objects like `Tags` or `ImageHeader`, or `globalThis`) with `swapProperties` from `test-utils.js`, and call the returned restore function in `afterEach`.
- Where the dependency is a named function import (immutable binding), do not mock it. Craft real binary input with `getDataView` so the real function runs, or test one level up through the module's public API.

Use `npm run test` to run the unit tests and make use of `describe.only` and `it.only` for focused testing.

Mocha prints only the closing summary locally (`spec` on CI), configured in `.mocharc.cjs`; failures always print in full. Set `EXIFREADER_MOCHA_REPORTER=spec` for per-test output. The coverage table hides files at 100%; pass `--skip-full=false` to `c8` to see them.

### Platform differences

The tests have to pass on every platform CI runs them on, today Linux and Windows, and a contributor may develop on any of them. A test written on one platform can fail on another. What has gone wrong so far:

- **Line endings.** A checkout can have CRLF line endings, as the Windows CI job has. A test that reads a file of the repository as text replaces `\r\n` by `\n` before it compares (see `readCommittedText` in `test/unit/generate-tag-modules-spec.js`).
- **Paths.** Separators and roots differ. A file name handed to a tool that resolves it, such as Babel or webpack, comes back as that platform's absolute path, on Windows with a drive letter and backslashes. Build such a name with `path.resolve`, not `path.join`, and do not compare against a path written by hand with `/`.
- **Speed.** File operations can be far slower than on the machine a test was written on: creating files is more than 20 times slower on the Windows CI job. A test or hook that creates many files sets a timeout of its own.

Add to this list when a new kind of failure shows up.

### TDD: red-green-refactor

Write code test-first. For each new behavior:

1. **Red** — write the smallest failing test that captures the next bit of behavior. Run it and watch it fail for the expected reason (missing function, wrong return, etc.).
2. **Green** — write the smallest change in `src/` that makes the test pass. Resist adding anything the test doesn't demand.
3. **Refactor** — with tests green, tidy names, extract helpers, remove duplication. Re-run the suite after each change.

Cycle one behavior at a time, not one feature. A feature like "parse iloc constructionMethod 1" is many cycles (parse the idat box; resolve a single-extent cm-1 offset; handle a missing idat box; etc.), each one a red-green-refactor turn.

## Changelog

When making notable changes (new features, bug fixes, breaking changes, etc.), add an entry to the `Unreleased` section in `CHANGELOG.md`. Use the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format with the appropriate change type: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, or `Security`.

After updating, read through the whole `Unreleased` section again. Each change type must appear at most once, in the Keep a Changelog order above, with all its entries under that one heading. Duplicate headings (a second `Security`, for example) have slipped in several times.

## Adding Tags

1. Add hex-keyed entry in the appropriate `src/tag-names-*-ifd.js`
2. Add description function if needed, as a named export of the dictionary's sibling `*-descriptions.js` module, or of `src/tag-names-common.js` when dictionaries share it. An inline arrow in a dictionary fails `test/unit/tag-dictionary-shape-spec.js`
3. Run `npm run generate:tags` to regenerate the per-tag modules in `src/composable/tags/`
4. Add unit test in corresponding `test/unit/tag-names-*-spec.js`
5. Update `exif-reader.d.ts` and `test/types/exif-reader.ts` if the tag is user-facing. A type test in `test/types/exif-reader.ts` fails (`npm run test:types`) when a tag in a generated module under `src/composable/tags/` is not declared in `exif-reader.d.ts`.
