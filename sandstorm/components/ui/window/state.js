/**
 * @file window/state.js
 * @description Shared private state and the two lifecycle-event buses used
 * across the window-management split (see window/index.js for the
 * assembly). Split out of the original monolithic window.js — moved
 * verbatim, no logic changes.
 *
 * Dependency rule for this split: state.js imports nothing from its
 * siblings — every other window/*.js file may import from this one only.
 *
 * Two independent event buses live here, same as in the original file:
 * - `_eventMap`-backed (`event`/`removeEvent`/`trigger`) — used by
 *   `app.ui.windows.event/removeEvent/trigger`, keyed by a per-window
 *   `eventId` string stored via `.data("eventId")`.
 * - `windowEvents`-backed (`setEvent`/`triggerEvent`/`removeWindowEvent`/
 *   `clearEvents`) — used by `WindowElement`'s `.on/.trigger/.off`, keyed by
 *   `windowId`/`pid`. Renamed `removeEvent` → `removeWindowEvent` on export
 *   only to avoid colliding with the first bus's own `removeEvent` now that
 *   both live in the same module — every call site updated to match
 *   (`WindowElement.off()` in window/element.js); behavior is unchanged.
 *
 * @module components/ui/window/state
 */

// Local variable for the main menu, not globally accessible
let menu = null;
let _eventMap = {};
let caretRAF = null;

export function _caret() {
    if (app.exists("app.ui.caret")) {
        app.ui.caret.updatePosition();
    }
}

export function _caretRAF() {
    if (caretRAF) return;
    caretRAF = requestAnimationFrame(() => {
        caretRAF = null;
        _caret();
    });
}

/**
 * Registers a callback for a specific window event.
 * @param {string} eventId - Unique ID per window.
 * @param {string} eventName - Event name ("close", "maximize", "minimize").
 * @param {function} callback - Function to run when the event fires.
 * @param {number} order - Priority (lower number runs first).
 */
export function event(eventId, eventName, callback, order = 0) {
    if (!_eventMap[eventId]) _eventMap[eventId] = {};
    if (!_eventMap[eventId][eventName]) _eventMap[eventId][eventName] = [];

    _eventMap[eventId][eventName].push({ callback, order });

    // Sort callbacks by priority
    _eventMap[eventId][eventName].sort((a, b) => a.order - b.order);
}

/**
 * Removes a callback from the event map for a given eventId and eventName.
 * @param {string} eventId
 * @param {string} eventName
 */
export function removeEvent(eventId, eventName) {
    if (!eventId || !eventName) return;
    if (!_eventMap[eventId] || !_eventMap[eventId][eventName]) return;

    delete _eventMap[eventId][eventName];

    // Remove the eventId key if no events remain
    if (Object.keys(_eventMap[eventId]).length === 0) {
        delete _eventMap[eventId];
    }
}

/**
 * Triggers callbacks for a specific window event.
 * Async-compatible – waits for all callbacks to finish.
 * @param {string} eventId - Window event ID.
 * @param {string} eventName - Event type.
 * @param {HTMLElement} win - Window element.
 * @param {string} id - Program ID.
 */
export async function trigger(eventId, eventName, win, id) {
    if (!_eventMap[eventId] || !_eventMap[eventId][eventName]) return;

    for (const ev of _eventMap[eventId][eventName]) {
        try {
            await ev.callback(win, id);
        } catch (err) {
            app.dev.error(`Error in ${eventName} callback for ${eventId}: ${err}`, "Window");
        }
    }
}

/**
 * Sets the main menu if menuObj is a valid, non-empty object.
 * @param {Object} menuObj - The object representing the main menu.
 */
export function setMainMenu(menuObj) {
    if (
        typeof menuObj === "object" &&
        menuObj !== null &&
        Object.keys(menuObj).length > 0
    ) {
        menu = menuObj;
    } else {
        app.dev.warn(
            "setMainMenu: Invalid menuObj – must be a non-empty object."
        );
        menu = null; // Reset to null if invalid
    }
}

/**
 * Returns the current main menu object.
 * If the menu is not set or invalid, returns null.
 * @returns {Object|null} menu - The current main menu or null.
 */
export function getMainMenu() {
    if (
        typeof menu === "object" &&
        menu !== null &&
        Object.keys(menu).length > 0
    ) {
        return menu;
    } else {
        return null;
    }
}

/**
 * Resets the main menu to null.
 * Useful for clearing or reinitializing the menu state.
 */
export function resetMainMenu() {
    menu = "";
}

// ── Window event bus (second, independent bus — used by WindowElement) ────

export const windowEvents = new Map();

export function setEvent(windowId, type, callback) {
    if (!windowEvents.has(windowId)) {
        windowEvents.set(windowId, {});
    }
    const events = windowEvents.get(windowId);
    if (!events[type]) {
        events[type] = [];
    }
    events[type].push(callback);
    return callback;
}

export function triggerEvent(windowId, type, ...args) {
    if (!windowEvents.has(windowId)) return;
    const events = windowEvents.get(windowId);
    if (!events[type]) return;
    app.dev.log(`Running ${type} event for ` + windowId, "UI Window");
    events[type].forEach(callback => {
        try {
            const result = callback(...args);
            if (result instanceof Promise) {
                result.catch(error => {
                    console.error(`Error in async event callback (${type}):`, error);
                });
            }
        } catch (error) {
            console.error(`Error in event callback (${type}):`, error);
        }
    });
}

export function removeWindowEvent(windowId, type, callback) {
    if (!windowEvents.has(windowId)) return;
    const events = windowEvents.get(windowId);
    if (!events[type]) return;
    if (!callback) {
        events[type] = [];
        return;
    }
    const index = events[type].indexOf(callback);
    if (index > -1) {
        events[type].splice(index, 1);
    }
}

export function clearEvents(pid) {
    windowEvents.delete(pid);
}

export function getFileExtension(filePath) {
    return filePath.split(".").pop().toLowerCase();
}
