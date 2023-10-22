/* eslint-env node */
const {defineConfig} = require('cypress');

module.exports = defineConfig({
    e2e: {
        baseUrl: 'https://localhost:8080',
        specPattern: 'test/cypress/e2e/**/*.cy.js',
        screenshotsFolder: 'test/cypress/screenshots',
        supportFile: false,
        videosFolder: 'test/cypress/videos',
    }
});
