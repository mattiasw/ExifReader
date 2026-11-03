/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import * as Formats from '../../../src/composable/formats.js';
import {FORMAT_BRAND} from '../../../src/composable/brand.js';
import {tiff} from '../../../src/composable/formats/tiff.js';
import {jpeg} from '../../../src/composable/formats/jpeg.js';
import {png} from '../../../src/composable/formats/png.js';
import {heic} from '../../../src/composable/formats/heic.js';
import {avif} from '../../../src/composable/formats/avif.js';
import {jxl} from '../../../src/composable/formats/jxl.js';
import {webp} from '../../../src/composable/formats/webp.js';
import {gif} from '../../../src/composable/formats/gif.js';
import {xml} from '../../../src/composable/formats/xml.js';

describe('composable/formats', () => {
    it('should export each format by name, as its own module\'s object', () => {
        expect(Object.keys(Formats).sort()).to.deep.equal(['allFormats', 'avif', 'gif', 'heic', 'jpeg', 'jxl', 'png', 'tiff', 'webp', 'xml']);
        expect(Formats.tiff).to.equal(tiff);
        expect(Formats.jpeg).to.equal(jpeg);
        expect(Formats.png).to.equal(png);
        expect(Formats.heic).to.equal(heic);
        expect(Formats.avif).to.equal(avif);
        expect(Formats.jxl).to.equal(jxl);
        expect(Formats.webp).to.equal(webp);
        expect(Formats.gif).to.equal(gif);
        expect(Formats.xml).to.equal(xml);
    });

    it('should list every format in detection order', () => {
        expect(Formats.allFormats).to.deep.equal([tiff, jpeg, png, heic, avif, jxl, webp, gif, xml]);
        expect(Formats.allFormats.map((format) => format.header.fileType.value)).to.deep.equal(['tiff', 'jpeg', 'png', 'heic', 'avif', 'jxl', 'webp', 'gif', 'xml']);
    });

    it('should brand every format, and none of their headers or readers', () => {
        for (const format of Formats.allFormats) {
            expect(format.brand, format.header.fileType.value).to.equal(FORMAT_BRAND);
            expect(format.header).to.not.have.property('brand');
            for (const reader of format.readers) {
                expect(reader).to.not.have.property('brand');
            }
        }
    });
});
