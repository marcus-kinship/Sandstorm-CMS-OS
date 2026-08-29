/**
 * @file explorer/explorer.js
 * @description File Explorer program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * program — registration (the shared `app.explorer` API, folder icons,
 * program metadata) lives in `setup.js`.
 * Exports `start(os, win)` (window creation and shell initialisation).
 *
 * Split into `window/state.js`, `window/fsutil.js`, `window/icons.js`,
 * `window/search.js`, `window/tree.js`, `window/list.js`,
 * `window/breadcrumb.js`, `window/meta.js`, `window/core.js`,
 * `window/menus.js`, `window/rows.js`, `window/createitems.js`,
 * `window/dragdrop.js`, `window/dialogmode.js`, `window/toolbar.js`, and
 * `window/index.js` (the assembler) — this file is now just the side-effect
 * entry point `app.program.open()`'s lazy `import()` fetches, unchanged
 * path, same external behavior.
 *
 * @module components/explorer/explorer
 */
export { start } from './window/index.js';
