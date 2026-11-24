/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('agent instructions', () => {
    it('keeps only the AGENTS.md import line in CLAUDE.md', () => {
        // Trimmed because the Windows CI job checks text files out with CRLF.
        const text = fs.readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8').trim();

        expect(text, 'CLAUDE.md must hold only the line @AGENTS.md; put instructions in AGENTS.md')
            .to.equal('@AGENTS.md');
    });

    it('has the AGENTS.md that CLAUDE.md imports', () => {
        expect(
            fs.existsSync(path.join(REPO_ROOT, 'AGENTS.md')),
            'CLAUDE.md imports AGENTS.md, which must exist in the repository root'
        ).to.equal(true);
    });
});
