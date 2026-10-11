/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global globalThis, __non_webpack_require__ */

export default {
    builtin,
    optionalPackage
};

/**
 * Loads a Node builtin module such as `fs`, `http` or `https`.
 *
 * @param {string} name
 * @returns {Object|undefined} The module, or undefined where none is reachable
 *          (browsers, workers).
 */
function builtin(name) {
    return firstLoaded(name, [webpackRequire, getBuiltinModule, mainModuleRequire]);
}

/**
 * Loads an installed package through the literal require that webpack emits,
 * which Node and bundlers resolve from the UMD. The ES module source outside
 * webpack gets none: programs pass the domParser option instead.
 *
 * @param {string} name
 * @returns {Object|undefined} The package, or undefined where none is reachable.
 */
function optionalPackage(name) {
    return firstLoaded(name, [webpackRequire]);
}

// A loader throws where its mechanism is missing (no process, no
// getBuiltinModule, no mainModule), which moves on to the next one. process is
// never named as a free variable: Parcel 2 and webpack 4 would then bundle a
// process polyfill into browser builds of the source.
function firstLoaded(name, loaders) {
    for (let i = 0; i < loaders.length; i++) {
        try {
            return loaders[i](name);
        } catch (error) {
            // Try the next loader.
        }
    }
    return undefined;
}

// Literal names make webpack emit require('fs') and so on, which bundlers and
// file tracers follow. No typeof guard: webpack may not rewrite the identifier there.
// A try in this function makes bundlers treat fs and @xmldom/xmldom as optional.
function webpackRequire(name) {
    switch (name) {
        case 'fs':
            // eslint-disable-next-line no-useless-catch
            try {
                return __non_webpack_require__('fs');
            } catch (error) {
                throw error;
            }
        case 'http':
            return __non_webpack_require__('http');
        case 'https':
            return __non_webpack_require__('https');
        case '@xmldom/xmldom':
            // eslint-disable-next-line no-useless-catch
            try {
                return __non_webpack_require__('@xmldom/xmldom');
            } catch (error) {
                throw error;
            }
        default:
            throw new Error(`No webpack require for ${name}.`);
    }
}

function getBuiltinModule(name) {
    return globalThis.process.getBuiltinModule(name);
}

function mainModuleRequire(name) {
    return globalThis.process.mainModule.require(name);
}
