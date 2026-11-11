/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// A deliberately vanilla consumer-side webpack configuration: no
// string-replace-loader, no TagFilterPlugin, no Constants replacement. That is
// what makes the composable numbers comparable to the full dist's.
//
// The library is resolved from node_modules here, as a consumer resolves it,
// and the exclude below deliberately leaves node_modules/exifreader in, where a
// consumer's babel-loader would skip it. Transpiling both sides to the same
// baseline is what keeps the comparison about architecture rather than about
// syntax level, and it is the direction that costs the composable side bytes
// rather than saving them.

const os = require('os');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

const ROOT_PATH = path.resolve(__dirname, '..', '..');

if (!process.env.EXIFREADER_STOCK_ENTRY) {
    throw new Error('Set EXIFREADER_STOCK_ENTRY to a consumer file, absolute or relative to the repository root.');
}

module.exports = {
    mode: 'production',
    context: ROOT_PATH,
    entry: path.resolve(ROOT_PATH, process.env.EXIFREADER_STOCK_ENTRY),
    devtool: 'source-map',
    // UMD, to match what the repo's own config emits: the full dist this is
    // compared against is UMD, and an ESM wrapper would put a few hundred
    // bytes into the comparison that have nothing to do with tree-shaking.
    output: {
        // Webpack's default, ./dist, would overwrite the committed bundle.
        path: path.join(os.tmpdir(), 'exifreader-stock-bundle'),
        filename: 'exif-reader.js',
        library: {
            name: 'ExifReader',
            type: 'umd'
        },
        globalObject: 'typeof self !== \'undefined\' ? self : this'
    },
    optimization: {
        usedExports: true,
        sideEffects: true,
        minimizer: [new TerserPlugin({
            terserOptions: {
                compress: {
                    arguments: true,
                    booleans_as_integers: true,
                    passes: 3,
                    typeofs: false,
                    unsafe: true,
                },
                sourceMap: true,
            }
        })]
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules[\\/](?!exifreader[\\/])/,
                use: {loader: 'babel-loader'}
            }
        ]
    }
};
