import {defineConfig} from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import pluginCypress from 'eslint-plugin-cypress';

export default defineConfig([
    {
        ignores: ['**/dist/', '**/gh-pages/', 'coverage/'],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2018,
            sourceType: 'module',
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            'array-bracket-spacing': ['error', 'never'],
            'arrow-parens': ['error', 'always'],
            'arrow-spacing': ['error'],
            'block-spacing': ['error'],
            'brace-style': ['error'],
            'comma-dangle': ['error', 'only-multiline'],
            'comma-spacing': ['error', {before: false, after: true}],
            'computed-property-spacing': ['error', 'never'],
            'curly': ['error'],
            'dot-location': ['error', 'property'],
            'eol-last': ['error'],
            'eqeqeq': ['error', 'always'],
            'no-else-return': ['error'],
            'no-empty-function': ['error'],
            'no-restricted-globals': ['error', 'event'],
            'no-spaced-func': ['error'],
            'indent': ['error', 4, {SwitchCase: 1}],
            'key-spacing': ['error', {beforeColon: false, afterColon: true}],
            'keyword-spacing': ['error', {before: true, after: true}],
            'no-console': ['error'],
            'no-extra-semi': ['error'],
            'no-inner-declarations': ['error', 'functions', {blockScopedFunctions: 'disallow'}],
            'no-irregular-whitespace': ['error', {skipStrings: true, skipRegExps: true, skipTemplates: true}],
            'no-mixed-spaces-and-tabs': ['error'],
            'no-multi-spaces': ['error'],
            'no-multiple-empty-lines': ['error', {max: 1, maxBOF: 0, maxEOF: 0}],
            'no-shadow': ['error', {allow: ['error', 'callback']}],
            'no-trailing-spaces': ['error'],
            'no-unused-vars': ['error', {caughtErrors: 'none'}],
            'no-var': ['error'],
            'no-warning-comments': ['error', {terms: ['todo', 'to do', 'fixme', 'fix me']}],
            'no-whitespace-before-property': ['error'],
            'multiline-ternary': ['error', 'never'],
            'object-curly-spacing': ['error', 'never'],
            'object-shorthand': ['error'],
            'operator-linebreak': ['error', 'before', {overrides: {'=': 'after'}}],
            'padded-blocks': ['error', 'never'],
            'prefer-const': ['error', {destructuring: 'any', ignoreReadBeforeAssign: false}],
            'quotes': ['error', 'single'],
            'radix': ['error'],
            'rest-spread-spacing': ['error', 'never'],
            'semi': ['error', 'always'],
            'semi-spacing': ['error'],
            'spaced-comment': ['error', 'always'],
            'space-before-blocks': ['error', 'always'],
            'space-before-function-paren': ['error', {anonymous: 'always', named: 'never'}],
            'space-infix-ops': ['error'],
            'space-in-parens': ['error', 'never'],
            'space-unary-ops': [2, {words: true, nonwords: false}],
            'template-curly-spacing': ['error'],
        },
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.mocha,
                ...globals.node,
            },
        },
    },
    {
        files: ['bin/**/*.js', 'webpack.config.js', 'cypress.config.js'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    {
        files: ['examples/global/**/*.js'],
        languageOptions: {
            globals: {
                ExifReader: 'writable',
            },
        },
        rules: {
            'no-var': 'off',
        },
    },
    {
        files: ['examples/nodejs/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-console': 'off',
        },
    },
    {
        files: ['examples/amd/**/*.js'],
        languageOptions: {
            globals: {
                requirejs: 'writable',
            },
        },
        rules: {
            'no-var': 'off',
        },
    },
    {
        files: ['test/cypress/e2e/**/*.js'],
        extends: [
            pluginCypress.configs.recommended,
            pluginCypress.configs.globals,
        ],
    },
]);
