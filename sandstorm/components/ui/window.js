/**
 * @file window.js
 * @description Window management system for the Sandstorm OS environment.
 *
 * Registers `app.ui.windows` — the core window-management namespace — along
 * with the global `basWindow(options)` helper and the `WindowElement` class
 * that wraps individual program window instances.
 *
 * Responsibilities:
 * - Create, position, resize, minimize, maximize, and close windows.
 * - Manage z-index ordering across all open windows.
 * - Fire and consume per-window lifecycle events (`before`, `after`, `close`).
 * - Provide a `windowStart(programId, options)` entry-point called by programs
 *   to open their UI inside a managed window frame.
 * - Expose `app.ui.windows.functions` for taskbar/window-list operations:
 *   `getOrder`, `setMainMenu`, `closeActiveWindow`, etc.
 *
 * Split into `window/state.js`, `window/lifecycle.js`, `window/dragresize.js`,
 * `window/menu-body.js`, `window/element.js`, `window/dialogs.js`, and
 * `window/index.js` (the assembler) — this file is now just the side-effect
 * entry point `load.js`'s `systemfiles` list imports, unchanged path, same
 * external behavior. The browser's native ES module loader fetches every
 * statically-imported sibling below in parallel; `index.js`'s own imports
 * then execute in the dependency order the module graph guarantees.
 *
 * @module components/ui/window
 */
import "./window/index.js";
