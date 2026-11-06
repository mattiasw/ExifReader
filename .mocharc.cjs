'use strict';

const path = require('path');

// Summary-only reporter locally to keep test output small; CI keeps spec.
// Set EXIFREADER_MOCHA_REPORTER (spec, dot, ...) to override either.
// Failures always print in full with every reporter.
module.exports = {
    reporter: process.env.EXIFREADER_MOCHA_REPORTER || (process.env.CI ? 'spec' : path.join(__dirname, 'test/quiet-reporter.cjs'))
};
