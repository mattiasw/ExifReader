/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import exifErrors from '../../src/errors.js';

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

    describe('UnsupportedFormatError', () => {
        it('should be an Error instance of its own class with the given message', () => {
            const err = new exifErrors.UnsupportedFormatError('Invalid image format');
            expect(err instanceof exifErrors.UnsupportedFormatError).to.be.true;
            expect(err instanceof Error).to.be.true;
            expect(err.name).to.equal('UnsupportedFormatError');
            expect(err.message).to.equal('Invalid image format');
        });

        it('should name its class when turned into a string', () => {
            expect(String(new exifErrors.UnsupportedFormatError('custom message'))).to.equal('UnsupportedFormatError: custom message');
        });

        it('should have no default message', () => {
            expect(new exifErrors.UnsupportedFormatError().message).to.equal(undefined);
        });

        it('should carry a stack taken when it is constructed', () => {
            const stack = new exifErrors.UnsupportedFormatError('the message').stack;
            expect(stack).to.include('at new UnsupportedFormatError');
            expect(stack.split('\n')[0]).to.equal('Error: the message');
        });
    });
});
