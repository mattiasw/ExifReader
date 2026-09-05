/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// A module listed here cannot produce anything without the module it maps to.
// The thumbnail is stored in the Exif metadata, in IFD1, maker notes and
// Photoshop tags are read from an Exif tag. MPF is not listed: it has its own
// JPEG segment and parses without the Exif module.
const MODULE_DEPENDENCIES = {
    thumbnail: 'exif',
    maker_notes: 'exif',
    photoshop: 'exif'
};

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
            includes[module] = includesConfig[module] || isNeededByAnIncludedModule(module, includesConfig);
        }
        return includes;
    }

    if (excludesConfig) {
        const includes = {};
        for (const module of modules) {
            const dependency = MODULE_DEPENDENCIES[module];
            includes[module] =
                !(
                    excludesConfig.includes(module)
                    || (dependency && excludesConfig.includes(dependency))
                );
        }
        return includes;
    }

    return false;
}

function isNeededByAnIncludedModule(module, includesConfig) {
    return Object.keys(MODULE_DEPENDENCIES)
        .some((dependent) => (MODULE_DEPENDENCIES[dependent] === module) && !!includesConfig[dependent]);
}
