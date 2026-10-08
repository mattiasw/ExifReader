/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {unshareFile} from '../../bin/unshare-file.js';
import {swapProperties} from './test-utils.js';

describe('unshare-file', () => {
    let dir;
    let filePath;
    let linkPath;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exifreader-unshare-'));
        filePath = path.join(dir, 'exif-reader.js');
        linkPath = path.join(dir, 'store-copy.js');
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    it('gives a hardlinked file its own inode with the same content', () => {
        createHardlinkedFile();

        unshareFile(filePath);

        expect(inode(filePath)).to.not.equal(inode(linkPath));
        expect(fs.statSync(filePath).nlink).to.equal(1);
        expect(fs.statSync(linkPath).nlink).to.equal(1);
        expect(fs.readFileSync(filePath, 'utf8')).to.equal('stock');
        expect(fs.readFileSync(linkPath, 'utf8')).to.equal('stock');
    });

    it('stops later writes to the unshared file from reaching the other link', () => {
        createHardlinkedFile();

        unshareFile(filePath);
        fs.writeFileSync(filePath, 'custom');

        expect(fs.readFileSync(linkPath, 'utf8')).to.equal('stock');
    });

    it('leaves no temp file behind', () => {
        createHardlinkedFile();

        unshareFile(filePath);

        expect(fs.readdirSync(dir).sort()).to.deep.equal(['exif-reader.js', 'store-copy.js']);
    });

    it('leaves a file that is not hardlinked untouched', () => {
        fs.writeFileSync(filePath, 'stock');
        const inodeBefore = inode(filePath);

        unshareFile(filePath);

        expect(inode(filePath)).to.equal(inodeBefore);
        expect(fs.readFileSync(filePath, 'utf8')).to.equal('stock');
    });

    it('ignores a missing file', () => {
        expect(() => unshareFile(filePath)).to.not.throw();
        expect(fs.readdirSync(dir)).to.deep.equal([]);
    });

    it('rethrows a failed rename, removes the temp file and keeps the link', () => {
        createHardlinkedFile();
        const renameError = new Error('rename failed');
        const restore = swapProperties(fs, {
            renameSync() {
                throw renameError;
            }
        });

        try {
            expect(() => unshareFile(filePath)).to.throw(renameError);
        } finally {
            restore();
        }

        expect(fs.readdirSync(dir).sort()).to.deep.equal(['exif-reader.js', 'store-copy.js']);
        expect(inode(filePath)).to.equal(inode(linkPath));
        expect(fs.statSync(filePath).nlink).to.equal(2);
        expect(fs.readFileSync(filePath, 'utf8')).to.equal('stock');
    });

    it('rethrows a failed copy and keeps the link', () => {
        createHardlinkedFile();
        const copyError = new Error('copy failed');
        const restore = swapProperties(fs, {
            copyFileSync() {
                throw copyError;
            }
        });

        try {
            expect(() => unshareFile(filePath)).to.throw(copyError);
        } finally {
            restore();
        }

        expect(fs.readdirSync(dir).sort()).to.deep.equal(['exif-reader.js', 'store-copy.js']);
        expect(inode(filePath)).to.equal(inode(linkPath));
    });

    function createHardlinkedFile() {
        fs.writeFileSync(filePath, 'stock');
        fs.linkSync(filePath, linkPath);
    }

    function inode(filePathToStat) {
        return fs.statSync(filePathToStat, {bigint: true}).ino;
    }
});
