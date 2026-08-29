/**
 * @file explorer/setup.js
 * @description Boot-time registration for the File Explorer program.
 *
 * Builds the entire shared `app.explorer` API (clipboard, file ops, meta
 * panel widget registry, folder icons, `openWith`/New-submenu wiring) that
 * other system code (recyclebin restore/send, desktop right-click "New",
 * notepad's New-file entries) depends on existing immediately, regardless
 * of whether the Explorer window is ever opened — all boot-critical. The
 * window UI lives in `explorer.js`, lazy-loaded by `app.program.open()` the
 * first time the user actually opens the program.
 *
 * Split into `explorer/setup/icons.js`, `explorer/setup/shell.js`,
 * `explorer/setup/core.js`, `explorer/setup/fileops.js`,
 * `explorer/setup/icon_menu.js`, `explorer/setup/dialogs.js`,
 * `explorer/setup/shortcuts.js`, and `explorer/setup/index.js` (the
 * assembler) — this file now just re-exports `setup(os)` from there.
 * `load.js`'s `systemfiles`/`programs` list imports this unchanged path;
 * same external behavior.
 *
 * @module components/explorer/setup
 */
export { setup } from './setup/index.js';
