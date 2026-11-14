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

        it('should be an Error with its own name', () => {
            const err = new exifErrors.MetadataMissingError();
            expect(err instanceof Error).to.be.true;
            expect(err.name).to.equal('MetadataMissingError');
        });

        it('should name its class when turned into a string', () => {
            expect(String(new exifErrors.MetadataMissingError())).to.equal('MetadataMissingError: No Exif data');
        });

        it('should carry a stack taken when it is constructed', () => {
            const stack = new exifErrors.MetadataMissingError().stack;
            expect(stack).to.include('at new MetadataMissingError');
            expect(stack.split('\n')[0]).to.equal('Error');
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

    ['MetadataMissingError', 'UnsupportedFormatError'].forEach((className) => {
        describe(`${className} as an object`, () => {
            it('should keep its own stack when later errors of the class are created', () => {
                const ErrorClass = exifErrors[className];
                function fromAlpha() {
                    return new ErrorClass('alpha');
                }
                function fromBeta() {
                    return new ErrorClass('beta');
                }
                const first = fromAlpha();
                const firstStack = first.stack;

                const second = fromBeta();

                expect(first.stack).to.equal(firstStack);
                expect(first.stack).to.include('fromAlpha');
                expect(first.stack).to.not.include('fromBeta');
                expect(second.stack).to.include('fromBeta');
                expect(second.stack).to.not.include('fromAlpha');
            });

            it('should have its class as constructor', () => {
                expect(new exifErrors[className]('message').constructor).to.equal(exifErrors[className]);
            });

            it('should let the stack be replaced and removed, as on a built-in error', () => {
                const descriptor = Object.getOwnPropertyDescriptor(new exifErrors[className]('message'), 'stack');
                expect(descriptor.writable).to.be.true;
                expect(descriptor.configurable).to.be.true;
                expect(descriptor.enumerable).to.be.false;
            });

            it('should let the constructor be replaced and removed, as on a built-in prototype', () => {
                const descriptor = Object.getOwnPropertyDescriptor(exifErrors[className].prototype, 'constructor');
                expect(descriptor.writable).to.be.true;
                expect(descriptor.configurable).to.be.true;
                expect(descriptor.enumerable).to.be.false;
            });

            it('should list only name and message as enumerable keys', () => {
                expect(Object.keys(new exifErrors[className]('message'))).to.deep.equal(['name', 'message']);
            });
        });
    });
});
