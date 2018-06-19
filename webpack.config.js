/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-env node */

const path = require('path');

module.exports = {
    mode: 'production',
    entry: {
        'exif-reader': path.resolve('./src/exif-reader.js')
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        library: 'ExifReader',
        libraryTarget: 'umd',
        globalObject: 'typeof self !== \'undefined\' ? self : this'
    },
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: [{
                    loader: 'babel-loader',
                    query: {
                        retainLines: true
                    }
                }]
            }
        ]
    }
};
