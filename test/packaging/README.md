# Resolver matrix

`resolver-matrix.mjs` packs the working tree, extracts it into a temporary
consumer project and resolves seven specifiers with the real tools:

- `exifreader`
- `exifreader/package.json`
- `exifreader/src/exif-reader.js`
- `exifreader/dist/exif-reader.js`
- `exifreader/src/exif-reader`
- `exifreader/dist/exif-reader`
- `exifreader/src/composable/x.js` (must fail)

The legs are webpack 5 (esm and commonjs, plus `target: 'node'` with
module-first and main-first `mainFields`), esbuild (browser and node, import
and require, plus browser with Wrangler's explicit `conditions`), Vite, Rollup
with `@rollup/plugin-node-resolve`, Parcel 2 (with and without
`packageExports`), Metro with the React Native 0.79 defaults (package exports
on for import and require, off, and on for the web platform), TypeScript 5 with
`moduleResolution` node10, and Node, Bun and Deno (import and require, through
`runtime-smoke.mjs`). It prints a table of the files each leg resolved and
fails on any difference from its `EXPECTED` table, which records what each
tool resolves with the exports map as shipped, not what the last release
without a map resolved. Where a tool says so, it also checks that the
composable path is refused as not exported rather than just missing.

## Running it

```sh
npm run test:packaging:install
npm run test:packaging
```

The first command installs the tools into `test/packaging/tools/node_modules`,
without a lockfile and without touching the root `package.json`. Bun and Deno
must be on `PATH`; install them with their official installers:

```sh
curl -fsSL https://bun.sh/install | bash
curl -fsSL https://deno.land/install.sh | sh
```

## When to run it

Run it at every change to the `exports` map in `package.json`, before the
release that carries the change ships: the release that adds the map, the
release that adds the composable subpaths, and v5.

## Refreshing `EXPECTED`

When the map changes, run the matrix on the working tree and check that every
changed cell is intended. Then copy the printed table into `EXPECTED`, with
`null` for each `error` cell, and update the comment above it.

To compare with a previous release, pack it into a scratch directory and run
the matrix against that tarball:

```sh
mkdir -p /tmp/exifreader-previous
npm pack exifreader@<previous release> --pack-destination /tmp/exifreader-previous
npm run test:packaging -- --tarball /tmp/exifreader-previous/exifreader-<previous release>.tgz
```

Every cell where that release resolves differently from `EXPECTED` prints a
`DEVIATION` line and makes the run exit 1. Do not copy that table into
`EXPECTED`.

## Why it is not in pre-commit or CI

The exports map changes rarely, and a permanent matrix would track resolver
changes in six third-party tools as devDependencies. The permanent legs cover
the rest: `test/build/packaging.js` checks Node, webpack's resolver and the
types on TypeScript 7 through the packed package, and the CI workflow runs
`runtime-smoke.mjs` under Bun and Deno.
