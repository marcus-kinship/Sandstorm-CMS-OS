/**
 * @file cursor/events.js
 * @description Internal pub/sub bus for the Cursor Engine. True leaf module —
 * imports nothing — so every other cursor/*.js file can depend on it without
 * risking a cycle.
 *
 * Named events used across the engine: `cursorchange`, `positionchange`,
 * `visibilitychange`, `settingschange`, `permissionused`. Modules talk to
 * each other exclusively through these instead of calling each other's
 * functions directly (e.g. `motion.js` never touches the DOM itself — it
 * emits `positionchange` and `renderer.js` is the only listener that acts
 * on it).
 *
 * @module components/cursor/events
 */

const _listeners = new Map(); // event name -> Set<callback>

/**
 * @param {string} event
 * @param {function} callback
 * @returns {function} callback, for convenient `const fn = on(...)` + later `off(event, fn)`.
 */
export function on(event, callback) {
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(callback);
    return callback;
}

/**
 * @param {string} event
 * @param {function} callback
 */
export function off(event, callback) {
    _listeners.get(event)?.delete(callback);
}

/**
 * @param {string} event
 * @param {*} [payload]
 */
export function emit(event, payload) {
    const set = _listeners.get(event);
    if (!set) return;
    for (const cb of set) {
        try {
            cb(payload);
        } catch (err) {
            app.dev?.error?.(`[cursor/events] listener for "${event}" threw: ${err}`, "Cursor");
        }
    }
}
