/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import Xml from '../../../../src/xml.js';
import {xmlHeader} from '../../../../src/composable/formats/xml.js';
import {recordCalls} from '../test-context.js';

describe('composable/formats/xml', () => {
    const restores = [];

    afterEach(() => {
        while (restores.length > 0) {
            restores.pop()();
        }
    });

    it('should give the XML file type', () => {
        expect(xmlHeader.fileType).to.deep.equal({value: 'xml', description: 'XML'});
    });

    it('should detect and find through Xml.isXMLFile and Xml.findOffsets at call time', () => {
        const dataView = {};
        const ranges = [];
        const detects = recordCalls(Xml, 'isXMLFile', 'detected');
        const finds = recordCalls(Xml, 'findOffsets', 'blocks');
        restores.push(detects.restore, finds.restore);

        expect(xmlHeader.detect(dataView)).to.equal('detected');
        expect(xmlHeader.find(dataView, ranges)).to.equal('blocks');

        expect(detects.calls).to.have.lengthOf(1);
        expect(detects.calls[0][0]).to.equal(dataView);
        expect(finds.calls).to.have.lengthOf(1);
        expect(finds.calls[0]).to.have.lengthOf(2);
        expect(finds.calls[0][0]).to.equal(dataView);
        expect(finds.calls[0][1]).to.equal(ranges);
    });
});
