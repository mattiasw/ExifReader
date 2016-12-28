/* eslint-env node */

const webpack = require('webpack');

module.exports = {
    output: {
        library: 'ExifReader',
        libraryTarget: 'umd'
    },
    devtool: 'source-map',
    module: {
        loaders: [
            {
                test: /.js$/,
                loader: 'babel-loader',
                query: {
                    retainLines: true
                }
            }
        ]
    },
    plugins: [
        new webpack.optimize.UglifyJsPlugin({
            compress: {warnings: false},
            mangle: true
        })
    ]
};
