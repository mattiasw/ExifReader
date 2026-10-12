/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {swapProperties, expectTimeRatioBelow, expectAsyncTimeRatioBelow} from './test-utils.js';

describe('test-utils', () => {
    let clock;
    let restorePerformance;

    beforeEach(() => {
        clock = 0;
        restorePerformance = swapProperties(performance, {now: () => clock});
    });

    afterEach(() => {
        restorePerformance();
    });

    describe('expectTimeRatioBelow', () => {
        it('should return the result of a run below the ratio', () => {
            expect(expectTimeRatioBelow(takes(10), takes(230, 'result'), 24)).to.equal('result');
        });

        it('should fail a run at the ratio and give both times', () => {
            expect(() => expectTimeRatioBelow(takes(10), takes(240), 24)).to.throw('run 240.0 ms, baseline 10.0 ms');
        });

        it('should compare against the faster of two baseline runs', () => {
            expect(() => expectTimeRatioBelow(takes(100, undefined, 10), takes(240), 24)).to.throw('baseline 10.0 ms');
            expect(() => expectTimeRatioBelow(takes(10, undefined, 100), takes(240), 24)).to.throw('baseline 10.0 ms');
        });

        it('should not check a run under 50 ms', () => {
            expect(() => expectTimeRatioBelow(takes(1), takes(49.9), 24)).to.not.throw();
        });

        it('should check a run of 50 ms', () => {
            expect(() => expectTimeRatioBelow(takes(1), takes(50), 24)).to.throw('run 50.0 ms, baseline 1.0 ms');
        });
    });

    describe('expectAsyncTimeRatioBelow', () => {
        it('should resolve to the result of a run below the ratio', async () => {
            expect(await expectAsyncTimeRatioBelow(takesAsync(10), takesAsync(230, 'result'), 24)).to.equal('result');
        });

        it('should fail a run at the ratio and give both times', async () => {
            const error = await expectAsyncTimeRatioBelow(takesAsync(10), takesAsync(240), 24).catch((rejection) => rejection);

            expect(error).to.be.an('error');
            expect(error.message).to.contain('run 240.0 ms, baseline 10.0 ms');
        });

        it('should compare against the faster of two baseline runs', async () => {
            for (const [first, second] of [[100, 10], [10, 100]]) {
                const error = await expectAsyncTimeRatioBelow(takesAsync(first, undefined, second), takesAsync(240), 24).catch((rejection) => rejection);

                expect(error).to.be.an('error');
                expect(error.message).to.contain('baseline 10.0 ms');
            }
        });
    });

    function takes(milliseconds, result, laterMilliseconds = milliseconds) {
        let calls = 0;
        return () => {
            clock += calls++ === 0 ? milliseconds : laterMilliseconds;
            return result;
        };
    }

    // The clock advances after an await, so the time only counts when the caller awaits the work.
    function takesAsync(milliseconds, result, laterMilliseconds = milliseconds) {
        const work = takes(milliseconds, result, laterMilliseconds);
        return () => Promise.resolve().then(work);
    }
});
