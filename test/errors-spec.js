/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import exifErrors from '../src/errors';

describe('errors', () => {
    describe('MetadataMissingError', () => {
        it('should support custom error instances', () => {
            const err = new exifErrors.MetadataMissingError();
            expect(err instanceof exifErrors.MetadataMissingError).to.be.true;
        });
        it('should support a custom error message', () => {
            const msg = 'custom message';
            const err = new exifErrors.MetadataMissingError(msg);
            expect(err.message).to.equal(msg);
        });
        it('should display a generic error message if none is supplied', () => {
            const err = new exifErrors.MetadataMissingError();
            expect(err.message).to.equal('No Exif data');
        });
    });
});
