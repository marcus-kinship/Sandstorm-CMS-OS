/**
 * @file cursor/detect.js
 * @description Figures out (a) where the real pointer is and (b) which of
 * the 13 cursors should be showing, by reading the `cursor:` CSS the OS
 * already declares everywhere (110× `pointer`, 82× `default`, etc. — zero
 * changes to any of those 58 files).
 *
 * `getComputedStyle` is called ONLY when the element under the pointer has
 * actually changed since the last event — never per animation frame, never
 * redundantly while the pointer moves within the same element. This module
 * is the only place in the whole engine that imports `cursor-map.js` or
 * calls `getComputedStyle`; `renderer.js` only ever sees the resolved
 * internal id via the `cursorchange` event.
 *
 * No-ops entirely while locked or following an element (`Cursor.lock()` /
 * `Cursor.follow()`) — position and cursor-type both freeze/redirect in
 * those modes.
 *
 * @module components/cursor/detect
 */

import * as state from './state.js';
import { resolveCSSCursor, FALLBACK_CURSOR_ID } from './cursor-map.js';
import { resolveRegistered } from './registry.js';

let _lastElement = null;

const NATIVE_HIDDEN_CLASS = 'cursor-engine-native-hidden';

function _resolve(el) {
    if (!el) return FALLBACK_CURSOR_ID;
    const html = document.documentElement;
    const wasSuppressed = html.classList.contains(NATIVE_HIDDEN_CLASS);
    if (wasSuppressed) html.classList.remove(NATIVE_HIDDEN_CLASS);
    const computed = getComputedStyle(el).cursor;
    if (wasSuppressed) html.classList.add(NATIVE_HIDDEN_CLASS);
    return resolveCSSCursor(computed) || resolveRegistered(computed) || FALLBACK_CURSOR_ID;
}

/** Shared by both pointermove and touch handlers below. */
function _updateFromPoint(x, y, el) {
    state.setTarget(x, y);

    if (state.isManualCursor()) return; // Cursor.set() is pinned — resume only via set(null)/set("auto")

    if (el === _lastElement) return; // same element as last move — skip getComputedStyle entirely
    _lastElement = el;

    state.setActiveCursorId(_resolve(el));
}

function _onPointerMove(e) {
    if (state.isLocked() || state.getFollowTarget()) return;

    _updateFromPoint(e.clientX, e.clientY, e.target);
}

// Real touch hardware DOES synthesize pointermove/pointerType:"touch" for a
// finger drag in most browsers, but that synthesis can be sparse/coalesced
// (confirmed live — a full drag gesture produced only a single synthesized
// pointermove), making the overlay visibly lag behind and only "catch up"
// once the drag settles rather than tracking the finger smoothly. Listening
// to touchmove directly guarantees the same per-event fidelity native touch
// scrolling itself gets, independent of how well any given browser's
// pointer-event synthesis behaves.
function _onTouch(e) {
    if (state.isLocked() || state.getFollowTarget()) return;
    const touch = e.touches[0];
    if (!touch) return;

    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    _updateFromPoint(touch.clientX, touch.clientY, el);
}

let _bound = false;

export function start() {
    if (_bound) return;
    _bound = true;
    document.addEventListener('pointermove', _onPointerMove, { passive: true });
    document.addEventListener('touchstart', _onTouch, { passive: true });
    document.addEventListener('touchmove', _onTouch, { passive: true });
}

export function stop() {
    if (!_bound) return;
    _bound = false;
    document.removeEventListener('pointermove', _onPointerMove);
    document.removeEventListener('touchstart', _onTouch);
    document.removeEventListener('touchmove', _onTouch);
    _lastElement = null;
}

/** Forces a re-read on the next move even over the same element — used
 *  after unlocking/unfollowing, since the cached element may now resolve to
 *  a different cursor than when it was cached (e.g. its own `cursor:` CSS
 *  changed while we were locked). */
export function invalidate() {
    _lastElement = null;
}

/**
 * Immediately re-detects the cursor for the pointer's last known position,
 * without waiting for the next `pointermove`. Needed right after a manual
 * pin (`Cursor.set()`/`systemSet()`) is released: without this, the overlay
 * keeps showing the just-unpinned glyph forever if the mouse doesn't move
 * again afterward — e.g. a program-launch busy/working cursor left stuck
 * once loading finishes while the user's hand is off the mouse.
 */
export function resync() {
    if (state.isLocked() || state.getFollowTarget() || state.isManualCursor()) return;
    const { x, y } = state.getTarget();
    const el = document.elementFromPoint(x, y);
    _lastElement = el;
    state.setActiveCursorId(_resolve(el));
}
