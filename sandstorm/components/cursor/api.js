/**
 * @file cursor/api.js
 * @description The public surface assembled onto `app.cursor` / `window.Cursor`
 * by `index.js`. Talks to `state.js`/`registry.js`/`settings-provider.js`/
 * `permission.js` and emits through `events.js` — never reaches into
 * `renderer.js` directly.
 *
 * Gated actions (`move`, `set`, `hide`, `lock`, `follow` — the ones the
 * Permission system's own purpose list names: "Flytta pekaren / Byta cursor /
 * gömma cursor / låsa cursor / följa ett element") first resolve
 * `permission.check(callerProgramId, "cursor-control")`, auto-prompting via
 * `permission.request(...)` when undecided. A denied/pending call resolves to
 * `false` and logs a dev warning rather than throwing or silently acting.
 * `show`/`unlock`/`settings`/`register`/`enable`/`disable`/etc. are
 * administrative, not gated — releasing/configuring is never the harmful
 * direction, acquiring control is.
 *
 * @module components/cursor/api
 */

import * as state from './state.js';
import * as registry from './registry.js';
import * as settingsProvider from './settings-provider.js';
import * as permission from './permission.js';
import { emit } from './events.js';
import { resync } from './detect.js';

const SCOPE = 'cursor-control';
export const version = '1.0.0';

const DENIED = Symbol('cursor-authorize-denied');

// `programId` is legitimately `null` when no window is active (the most
// trusted, system-level caller) — so `null` can't double as the "denied"
// sentinel the way it briefly did here, or every gated call would silently
// no-op whenever nothing happened to be focused. A dedicated Symbol can't
// collide with any real programId value.
async function _authorize(action) {
    const programId = permission.getCallerProgramId();
    let result = permission.check(programId, SCOPE);
    if (result === 'ask') result = await permission.request(programId, SCOPE);
    if (result !== 'granted') {
        app.dev?.warn?.(`[cursor] "${action}" denied for program "${programId || 'unknown'}"`);
        return DENIED;
    }
    return programId;
}

function _programName(programId) {
    return app.program?.getInfo?.(programId)?.name || programId || _('Okänt program');
}

/**
 * `Cursor.move(x, y)` or `Cursor.move(x, y, {duration, easing})` or the
 * single-object form `Cursor.move({x, y, duration, easing})` — both call
 * shapes are in the spec's own examples.
 */
export async function move(xOrOptions, y, options) {
    const programId = await _authorize('move');
    if (programId === DENIED) return false;

    let x, targetY, moveOptions = null;
    if (typeof xOrOptions === 'object' && xOrOptions !== null) {
        ({ x, y: targetY, ...moveOptions } = xOrOptions);
    } else {
        x = xOrOptions;
        targetY = y;
        moveOptions = options || null;
    }
    state.setTarget(x, targetY, moveOptions && Object.keys(moveOptions).length ? moveOptions : null);
    return true;
}

/** `Cursor.set("busy")` — pins the shown cursor, suppressing automatic
 *  CSS-based detection until `set(null)`/`set("auto")` resumes it. */
export async function set(cursorId) {
    const programId = await _authorize('set');
    if (programId === DENIED) return false;

    _pin(cursorId);
    return true;
}

function _pin(cursorId) {
    if (cursorId == null || cursorId === 'auto') {
        state.setManualCursor(false);
        resync();
        return;
    }
    const resolved = registry.resolveRegistered(cursorId) || cursorId;
    state.setManualCursor(true);
    state.setActiveCursorId(resolved);
}

/**
 * Ungated system-level cursor pin — the same state write `set()` performs
 * once authorized, minus `_authorize()`. Not for program use: there is no
 * single "calling program" to gate an OS-internal cue against in the first
 * place (e.g. program.js's program-launch busy/working feedback), so this
 * follows this module's existing `show`/`unlock`/`settings` precedent of
 * leaving purely administrative, non-adversarial actions ungated.
 * `cursorId` of `null`/`"auto"` resumes automatic CSS-based detection, same
 * as `set(null)`. Low-level primitive — for the specific "app is starting"
 * cue, prefer `startWorking()`/`stopWorking()` below, which get the
 * release+resync+render sequence right by construction and survive
 * overlapping callers; this one is for an unconditional reset (e.g.
 * load.js's "the system is definitely ready now" boundary).
 */
export function systemSet(cursorId) {
    _pin(cursorId);
}

let _workingDepth = 0;

/**
 * The single entry point for "an app is starting" cursor feedback (see
 * program.js's open(), ui/window/dialogs.js's windowStart()). Previously
 * every caller pinned the cursor and, separately, had to remember to also
 * resync and confirm a render happened when releasing it — easy to get
 * subtly wrong at any one of several call sites, which is exactly how the
 * cursor got stuck showing working.svg after the app had actually finished
 * loading. Now there is exactly one place that sequence lives.
 */
export function startWorking() {
    _workingDepth++;
    if (_workingDepth === 1) _pin('cursor-working');
}

/**
 * Releases one startWorking() call. Once the count reaches zero this does
 * all three steps atomically and synchronously — release the pin
 * (state.setManualCursor(false)), re-detect what's actually under the
 * pointer right now rather than waiting for the next pointermove
 * (detect.resync()), and re-render (state.setActiveCursorId() inside
 * resync() synchronously emits 'cursorchange', which renderer.js's own
 * listener applies immediately — events.js's emit() is not batched or
 * deferred) — all inside `_pin(null)`, so no caller has to remember any of
 * this itself.
 */
export function stopWorking() {
    if (_workingDepth === 0) return;
    _workingDepth--;
    if (_workingDepth === 0) _pin(null);
}

export function show() {
    state.setVisible(true);
    emit('visibilitychange', true);
    return true;
}

export async function hide() {
    const programId = await _authorize('hide');
    if (programId === DENIED) return false;
    state.setVisible(false);
    return true;
}

export async function lock() {
    const programId = await _authorize('lock');
    if (programId === DENIED) return false;
    state.setLocked(true);
    emit('permissionused', { active: true, programName: _programName(programId) });
    return true;
}

export function unlock() {
    state.setLocked(false);
    emit('permissionused', { active: false, programName: null });
    return true;
}

export async function follow(element) {
    const programId = await _authorize('follow');
    if (programId === DENIED) return false;
    state.setFollowTarget(element);
    emit('permissionused', { active: !!element, programName: element ? _programName(programId) : null });
    return true;
}

/**
 * Forces an immediate re-detection of the cursor glyph at the pointer's
 * current position, bypassing detect.js's own per-element cache
 * (`_lastElement` — `getComputedStyle` is normally only re-read when the DOM
 * element under the pointer changes, for performance). Needed by any code
 * that changes a plain CSS `cursor:` value programmatically — via math, not
 * a real DOM element boundary — while the pointer stays over the same
 * element throughout (e.g. designer/tools/resize.js's ambient
 * splitter-boundary drag: hovering within a few px of a pane's edge is
 * still technically "over" that same large pane element the whole time, so
 * without this the engine never notices the cursor value it set changed
 * and keeps showing whatever glyph was resolved when the pointer last
 * crossed an actual element boundary — confirmed live, reported as the
 * resize cursor staying stuck across an entire block instead of only its
 * edge). Administrative, not gated — same `show`/`unlock`/`settings`
 * precedent as this file's other non-adversarial actions; it only forces a
 * read of CSS state that was already live, nothing a program couldn't
 * already see for itself.
 */
export function invalidate() {
    resync();
}

/** `Cursor.settings({enabled, speed, smoothness, theme, pack, size})` —
 *  administrative/configuration, not gated. */
export function settings(partial) {
    if (!partial) return state.getSettings();
    state.setSettings(partial);
    settingsProvider.save(state.getSettings());
    return state.getSettings();
}

export function getSettings() {
    return state.getSettings();
}

export function enable() {
    return settings({ enabled: true });
}

export function disable() {
    return settings({ enabled: false });
}

export function isEnabled() {
    return !!state.getSettings()?.enabled;
}

export function reset() {
    state.setSettings(settingsProvider.DEFAULT_SETTINGS);
    settingsProvider.save(state.getSettings());
    return state.getSettings();
}

/** `Cursor.register({id, svg, viewBox, aliases})` — plugin-style custom
 *  cursor types; not gated, this only extends the palette. */
export function register(def) {
    return registry.register(def);
}

export const permission_ = {
    request: (programId, scope = SCOPE) => permission.request(programId, scope),
    check: (programId, scope = SCOPE) => permission.check(programId, scope),
    set: (programId, decision, scope = SCOPE) => permission.set(programId, scope, decision),
    revoke: (programId, scope = SCOPE) => permission.revoke(programId, scope),
    list: (scope = SCOPE) => permission.list(scope),
    reset: (scope = SCOPE, programId) => permission.reset(scope, programId),
};
export { permission_ as permission };
