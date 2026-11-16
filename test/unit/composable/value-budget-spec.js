/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {expect} from 'chai';
import {getDataView} from '../test-utils.js';
import {createContext} from '../../../src/engine.js';
import {createTagFilter} from '../../../src/tag-filter.js';
import {getSharedValueBudget} from '../../../src/composable/value-budget.js';
import {getContext} from './test-context.js';

describe('composable/value-budget', () => {
    it('should create the value budget once, from the first view given, and ignore later views', () => {
        const ctx = getContext();
        const first = getDataView('\x00'.repeat(100));

        const budget = getSharedValueBudget(ctx, first);

        expect(budget.ifdEntriesRemaining).to.equal(Math.floor(100 / 12) * 4);
        expect(getSharedValueBudget(ctx, getDataView('\x00'.repeat(2000)))).to.equal(budget);
        expect(getSharedValueBudget(ctx)).to.equal(budget);
        expect(ctx.valueBudget).to.equal(budget);
    });

    it('should create the value budget from the file view when no view is given', () => {
        const ctx = getContext({dataView: getDataView('\x00'.repeat(120))});

        expect(getSharedValueBudget(ctx).ifdEntriesRemaining).to.equal(10 * 4);
    });

    it('should give no value budget without any view', () => {
        const ctx = createContext({dataView: undefined, options: {}, tagFilter: createTagFilter()});

        expect(getSharedValueBudget(ctx)).to.be.undefined;
    });
});
