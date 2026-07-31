const {defineConfig} = require('cypress');
const webpackPreprocessor = require('@cypress/webpack-preprocessor');

module.exports = defineConfig({
    allowCypressEnv: false,
    e2e: {
        baseUrl: 'https://localhost:8080',
        specPattern: 'test/cypress/e2e/**/*.cy.js',
        screenshotsFolder: 'test/cypress/screenshots',
        supportFile: false,
        videosFolder: 'test/cypress/videos',
        setupNodeEvents(on) {
            // Bundle the plain-JavaScript specs with webpack only. Cypress's
            // built-in preprocessor would also wire up TypeScript (`typescript`
            // is a devDependency here), whose TypeScript 7 path fails to
            // resolve a Babel preset inside the Cypress binary.
            // @see https://github.com/cypress-io/cypress/issues/34359
            on('file:preprocessor', webpackPreprocessor({webpackOptions: {mode: 'development'}}));
        },
    }
});
