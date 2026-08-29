/**
 * @file startmenu/state.js
 * @description Shared private module state for the start-menu split (see
 * startmenu/index.js for the assembly). Split out of the original
 * monolithic startmenu.js — moved verbatim, no logic changes.
 *
 * Dependency rule for this split: state.js imports nothing from its
 * siblings — every other startmenu/*.js file may import from this one only.
 *
 * `_logoffButtonSet` / `_helpButtonSet` / `_hiddenWindowIds` are exposed only
 * through accessor functions (not as raw exported bindings) because ES
 * modules forbid reassigning an imported binding from outside the module
 * that declared it — `buttons.js` and `running_apps.js` need to flip/replace
 * these values, so they call the setters here instead. `_buttons` is safe to
 * export directly since it's only ever mutated in place (`.push()`), never
 * reassigned.
 *
 * @module components/startmenu/state
 */

let _logoffButtonSet = false;
let _helpButtonSet = false;

/** Registered logoff/help buttons: `{ id, fnName }[]`. Only ever pushed to, never reassigned. */
export const _buttons = [];

/** { windowId, taskId }[] */
let _hiddenWindowIds = [];

export function isLogoffButtonSet() { return _logoffButtonSet; }
export function markLogoffButtonSet() { _logoffButtonSet = true; }

export function isHelpButtonSet() { return _helpButtonSet; }
export function markHelpButtonSet() { _helpButtonSet = true; }

export function getHiddenWindowIds() { return _hiddenWindowIds; }
export function setHiddenWindowIds(ids) { _hiddenWindowIds = ids; }
