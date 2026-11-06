/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use strict';

const Mocha = require('mocha');

// Prints only the closing summary on a green run. Failures print in full,
// the same list the spec reporter shows, so nothing is lost on a red run.
class QuietReporter extends Mocha.reporters.Base {
    constructor(runner, options) {
        super(runner, options);
        runner.once(Mocha.Runner.constants.EVENT_RUN_END, () => this.epilogue());
    }
}

module.exports = QuietReporter;
