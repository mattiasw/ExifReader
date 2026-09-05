/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

module.exports = parseConfig;

/**
 * Turn a custom build configuration into the module map the build uses.
 *
 * @param {{include?: object, exclude?: string[]}|false} config The build
 *   configuration as normalised by `getConfig()` in `webpack.config.js`, where
 *   `exclude` has already become an array of module names, or `false` when
 *   there is no configuration.
 * @returns {object|false} A map from module name to `false`, `true`, or the
 *   array of tag names to keep, or `false` when there is no configuration and
 *   the full bundle should be built.
 */
function parseConfig({include: includesConfig, exclude: excludesConfig}) {
    const modules = [
        'file',
        'jfif',
        'png_file',
        'exif',
        'iptc',
        'xmp',
        'icc',
        'photoshop',
        'maker_notes',
        'mpf',
        'thumbnail',
        'tiff',
        'jpeg',
        'png',
        'heic',
        'avif',
        'jxl',
        'webp',
        'gif'
    ];

    if (includesConfig) {
        const includes = {};
        for (const module of modules) {
            includes[module] = includesConfig[module] || isNeededByThumbnail(module, includesConfig);
        }
        return includes;
    }

    if (excludesConfig) {
        const includes = {};
        for (const module of modules) {
            includes[module] =
                !(
                    excludesConfig.includes(module)
                    || ((module === 'thumbnail') && excludesConfig.includes('exif'))
                    || ((module === 'mpf') && excludesConfig.includes('exif'))
                );
        }
        return includes;
    }

    return false;
}

// The thumbnail is stored in the Exif metadata, in IFD1, so it cannot be read
// without the Exif module. MPF has its own JPEG segment and parses without it.
function isNeededByThumbnail(module, includesConfig) {
    return (module === 'exif') && !!includesConfig.thumbnail;
}
