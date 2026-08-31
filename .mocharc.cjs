'use strict';

// Quiet dot reporter locally to keep test output small; CI keeps spec.
// Set EXIFREADER_MOCHA_REPORTER to override either. Failures always
// print in full with both reporters.
module.exports = {
    reporter: process.env.EXIFREADER_MOCHA_REPORTER || (process.env.CI ? 'spec' : 'dot')
};
