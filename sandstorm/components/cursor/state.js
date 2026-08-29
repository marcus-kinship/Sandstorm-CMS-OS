/**
 * @file cursor/state.js
 * @description Shared mutable state for the Cursor Engine. Imports only
 * `events.js` — every mutation emits an event instead of any other module
 * reaching in and reading/writing these fields directly.
 *
 * @module components/cursor/state
 */

import { emit } from './events.js';

const _state = {
    target: { x: 0, y: 0 },       // where the cursor should end up (raw pointer, or an explicit move() goal)
    moveOptions: null,             // { duration, easing } for the current explicit move, or null while just following the pointer
    activeCursorId: 'cursor-normal',
    visible: true,
    locked: false,
    followTarget: null,            // Element being followed via Cursor.follow(), or null
    pack: null,                    // current pack manifest ({ name, cursors: [{id,file,anchor}] })
    settings: null,                // full settings object (see settings-provider.js's DEFAULT_SETTINGS shape)
    manualCursor: false,           // true after Cursor.set(id) — detect.js skips auto-detection until cleared
};

export function isManualCursor() {
    return _state.manualCursor;
}

export function setManualCursor(manual) {
    _state.manualCursor = manual;
}

export function getTarget() {
    return { ..._state.target };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{duration?:number, easing?:string}|null} [moveOptions] - present
 *   only for an explicit `Cursor.move(x,y,{duration,easing})` call；`null`
 *   when this is just the raw pointer position being tracked continuously.
 */
export function setTarget(x, y, moveOptions = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    _state.target = { x, y };
    _state.moveOptions = moveOptions;
}

export function getMoveOptions() {
    return _state.moveOptions;
}

export function getActiveCursorId() {
    return _state.activeCursorId;
}

export function setActiveCursorId(id) {
    if (id === _state.activeCursorId) return;
    _state.activeCursorId = id;
    emit('cursorchange', id);
}

export function isVisible() {
    return _state.visible;
}

export function setVisible(visible) {
    if (visible === _state.visible) return;
    _state.visible = visible;
    emit('visibilitychange', visible);
}

export function isLocked() {
    return _state.locked;
}

export function setLocked(locked) {
    _state.locked = locked;
}

export function getFollowTarget() {
    return _state.followTarget;
}

export function setFollowTarget(el) {
    _state.followTarget = el || null;
}

export function getPack() {
    return _state.pack;
}

export function setPack(manifest) {
    _state.pack = manifest;
}

export function getSettings() {
    return _state.settings ? { ..._state.settings } : null;
}

/**
 * @param {Object} partial - Shallow-merged into current settings (one level
 *   deep for the nested `animations`/`security` objects too).
 */
export function setSettings(partial) {
    _state.settings = {
        ..._state.settings,
        ...partial,
        animations: { ..._state.settings?.animations, ...(partial.animations || {}) },
        security:   { ..._state.settings?.security,   ...(partial.security   || {}) },
    };
    emit('settingschange', getSettings());
}

/** Used once at boot to seed settings without treating it as a "change". */
export function initSettings(settings) {
    _state.settings = { ...settings };
}
