/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

(async function () {
    'use strict';

    const BUTTON_TEXT_SHOW = 'Show source code';
    const BUTTON_TEXT_HIDE = 'Hide source code';

    const sourceCode = document.querySelector('.source-code');

    sourceCode.innerHTML = `
        <button class="show-button button-outline">${BUTTON_TEXT_SHOW}</button>
        <pre class="hidden"><code></code></pre>
    `;

    const showButton = sourceCode.querySelector('.show-button');
    showButton.addEventListener('click', toggleSourceCode);

    if (sourceCode.getAttribute('data-initialize') !== null) {
        toggleSourceCode();
    }

    async function toggleSourceCode() {
        if (sourceCodeIsVisible()) {
            sourceCode.querySelector('pre').classList.add('hidden');
            showButton.innerHTML = BUTTON_TEXT_SHOW;
        } else {
            if (sourceCodeIsEmpty()) {
                const response = await fetch('exif.js');
                const sourceCodeText = (await response.text()).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                sourceCode.querySelector('code').innerHTML = sourceCodeText;
            }
            sourceCode.querySelector('pre').classList.remove('hidden');
            showButton.innerHTML = BUTTON_TEXT_HIDE;
        }
    }

    function sourceCodeIsVisible() {
        return !sourceCode.querySelector('pre').classList.contains('hidden');
    }

    function sourceCodeIsEmpty() {
        return sourceCode.querySelector('code').innerHTML.trim() === '';
    }
}());
