/**
 * @file networkmonitor/networkmonitor.js
 * @description Network Monitor program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * program — registration (`app.networkmonitor` API + wifi status icon)
 * lives in `setup.js`.
 *
 * @module components/networkmonitor/networkmonitor
 */

// Main entry point when the program is launched
export function start(os) {
    // Start network monitor with default taskbar status window
    app.networkmonitor.windows.controlcenter();
}
