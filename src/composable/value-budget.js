/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {getValueBudget} from '../tags-helpers.js';

/**
 * Returns the load's one value budget, creating it on the first call from
 * `view`, or from `ctx.dataView` when no view is given. Later calls return the
 * same object whatever view they pass. Undefined when there is no view at all.
 *
 * @param {object} ctx The load's engine context.
 * @param {DataView} [view] The view to size the budget from on the first call.
 * @returns {(object|undefined)} The shared budget.
 */
export function getSharedValueBudget(ctx, view) {
    if (ctx.valueBudget === undefined) {
        const budgetView = view || ctx.dataView;
        if (budgetView !== undefined) {
            ctx.valueBudget = getValueBudget(budgetView);
        }
    }
    return ctx.valueBudget;
}
