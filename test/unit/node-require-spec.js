/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import NodeRequire from '../../src/node-require.js';
import {swapProperties} from './test-utils.js';

const SENTINEL = {sentinel: true};
const XMLDOM = '@xmldom/xmldom';

describe('node-require', () => {
    let restores;

    beforeEach(() => {
        restores = [];
    });

    afterEach(() => {
        restores.reverse().forEach((restore) => restore());
    });

    function swap(target, replacement) {
        restores.push(swapProperties(target, replacement));
    }

    function swapWebpackRequire(webpackRequire) {
        swap(globalThis, {__non_webpack_require__: webpackRequire});
    }

    describe('builtin', () => {
        ['fs', 'http', 'https'].forEach((name) => {
            it(`returns what __non_webpack_require__ gives for ${name}`, () => {
                const requested = [];
                swapWebpackRequire((moduleName) => {
                    requested.push(moduleName);
                    return SENTINEL;
                });

                expect(NodeRequire.builtin(name)).to.equal(SENTINEL);
                expect(requested).to.deep.equal([name]);
            });
        });

        it('skips __non_webpack_require__ for a builtin it has no literal name for', () => {
            swapWebpackRequire(() => SENTINEL);

            expect(NodeRequire.builtin('module')).to.equal(process.getBuiltinModule('module'));
        });

        it('falls through to process.getBuiltinModule when __non_webpack_require__ is absent', () => {
            swapWebpackRequire(undefined);
            swap(process, {getBuiltinModule: (name) => (name === 'http' ? SENTINEL : undefined)});

            expect(NodeRequire.builtin('http')).to.equal(SENTINEL);
        });

        it('falls through to process.mainModule.require when getBuiltinModule is missing', () => {
            swapWebpackRequire(undefined);
            swap(process, {getBuiltinModule: undefined, mainModule: createFakeMainModule()});

            expect(NodeRequire.builtin('fs')).to.equal(SENTINEL);
        });

        it('returns undefined when no loader is available', () => {
            swapWebpackRequire(undefined);
            swap(process, {getBuiltinModule: undefined, mainModule: undefined});

            expect(NodeRequire.builtin('fs')).to.equal(undefined);
        });

        it('returns undefined when there is no process', () => {
            const result = callWithoutProcess(() => NodeRequire.builtin('fs'));

            expect(result).to.equal(undefined);
        });

        function createFakeMainModule() {
            const mainModule = {
                require(name) {
                    expect(this).to.equal(mainModule);
                    return ['fs', 'http', 'https'].includes(name) ? SENTINEL : undefined;
                }
            };
            return mainModule;
        }
    });

    describe('optionalPackage', () => {
        it('returns what __non_webpack_require__ gives for @xmldom/xmldom', () => {
            const requested = [];
            swapWebpackRequire((moduleName) => {
                requested.push(moduleName);
                return SENTINEL;
            });

            expect(NodeRequire.optionalPackage(XMLDOM)).to.equal(SENTINEL);
            expect(requested).to.deep.equal([XMLDOM]);
        });

        it('returns undefined when __non_webpack_require__ is absent, whatever the main module can resolve', () => {
            swapWebpackRequire(undefined);
            swap(process, {mainModule: {filename: import.meta.filename, require: () => SENTINEL}});

            expect(NodeRequire.optionalPackage(XMLDOM)).to.equal(undefined);
        });

        it('returns undefined when there is no process', () => {
            const result = callWithoutProcess(() => NodeRequire.optionalPackage(XMLDOM));

            expect(result).to.equal(undefined);
        });
    });
});

// Mocha itself needs process, so it is restored before anything else runs.
function callWithoutProcess(callback) {
    const restoreWebpackRequire = swapProperties(globalThis, {__non_webpack_require__: undefined});
    const restoreProcess = swapProperties(globalThis, {process: undefined});
    try {
        return callback();
    } finally {
        restoreProcess();
        restoreWebpackRequire();
    }
}
