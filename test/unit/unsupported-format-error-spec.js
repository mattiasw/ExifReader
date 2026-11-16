/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {UnsupportedFormatError} from '../../src/unsupported-format-error.js';

describe('unsupported-format-error', () => {
    it('should be an Error instance of its own class with the given message', () => {
        const err = new UnsupportedFormatError('Invalid image format');
        expect(err instanceof UnsupportedFormatError).to.be.true;
        expect(err instanceof Error).to.be.true;
        expect(err.name).to.equal('UnsupportedFormatError');
        expect(err.message).to.equal('Invalid image format');
    });

    it('should name its class when turned into a string', () => {
        expect(String(new UnsupportedFormatError('custom message'))).to.equal('UnsupportedFormatError: custom message');
    });

    it('should have no default message', () => {
        expect(new UnsupportedFormatError().message).to.equal(undefined);
    });

    it('should carry a stack taken when it is constructed', () => {
        const stack = new UnsupportedFormatError('the message').stack;
        expect(stack).to.include('at new UnsupportedFormatError');
        expect(stack.split('\n')[0]).to.equal('Error: the message');
    });

    it('should keep its own stack when later errors of the class are created', () => {
        function fromAlpha() {
            return new UnsupportedFormatError('alpha');
        }
        function fromBeta() {
            return new UnsupportedFormatError('beta');
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
        expect(new UnsupportedFormatError('message').constructor).to.equal(UnsupportedFormatError);
    });

    it('should let the stack be replaced and removed, as on a built-in error', () => {
        const descriptor = Object.getOwnPropertyDescriptor(new UnsupportedFormatError('message'), 'stack');
        expect(descriptor.writable).to.be.true;
        expect(descriptor.configurable).to.be.true;
        expect(descriptor.enumerable).to.be.false;
    });

    it('should let the constructor be replaced and removed, as on a built-in prototype', () => {
        const descriptor = Object.getOwnPropertyDescriptor(UnsupportedFormatError.prototype, 'constructor');
        expect(descriptor.writable).to.be.true;
        expect(descriptor.configurable).to.be.true;
        expect(descriptor.enumerable).to.be.false;
    });

    it('should list only name and message as enumerable keys', () => {
        expect(Object.keys(new UnsupportedFormatError('message'))).to.deep.equal(['name', 'message']);
    });
});
