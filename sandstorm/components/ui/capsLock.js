/**
 * @file capsLock.js
 * @description Caps Lock detection utility for the Sandstorm UI system.
 *
 * Registers `app.ui.capsLock.has([event])` which returns the current
 * Caps Lock state. When a `KeyboardEvent` is provided the state is read
 * directly from `event.getModifierState("CapsLock")`. Without an event
 * the last known state stored by the caret indicator (`_instance`) is used.
 *
 * @module components/ui/capsLock
 *
 * @example
 * document.addEventListener('keydown', e => {
 *   if (app.ui.capsLock.has(e)) {
 *     console.log('Caps Lock is ON');
 *   }
 * });
 */
/**
 * Namespace for UI components
 * @namespace
 */
app.ui = app.ui || {};
app.ui.capsLock = app.ui.capsLock || {};

/**
 * Checks if Caps Lock is currently active
 * @param {KeyboardEvent} [event] - Optional keyboard event to check Caps Lock state from
 * @returns {boolean} True if Caps Lock is on, false otherwise
 * 
 * @example
 * // Check Caps Lock status from keyboard event
 * document.addEventListener('keydown', (e) => {
 *   const isCapsOn = app.ui.capsLock.has(e);
 *   console.log('Caps Lock:', isCapsOn);
 * });
 * 
 * @example
 * // Check current Caps Lock state (requires a keyboard event to have occurred)
 * if (app.ui.capsLock.has()) {
 *   console.log('Caps Lock is on');
 * }
 */
app.ui.capsLock.has = function (event) {
    if (event && event instanceof KeyboardEvent) {
        return !!(
            event.getModifierState &&
            event.getModifierState("CapsLock")
        );
    }

    // If no event provided, return the last known state if indicator is initialized
    if (app.ui.capsLock._instance && app.ui.capsLock._instance.capsLockActive !== undefined) {
        return app.ui.capsLock._instance.capsLockActive;
    }

    app.dev.warn("app.ui.capsLock.has: Pass a KeyboardEvent to check Caps Lock status");
    return false;
};
