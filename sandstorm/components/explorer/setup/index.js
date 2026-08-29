/**
 * @file explorer/setup/index.js
 * @description Assembler for the explorer/setup.js split. Calls each
 * register*(os) in the dependency order the original monolithic setup.js
 * assigned things in: icons/program metadata first, then the core
 * `app.explorer` API (`_getNode`/`_fs`/`_refreshAll`/clipboard/metaPanel/
 * contextMenu) everything else needs, then file operations, shared icon
 * rendering + the context-menu catalog, file dialogs, and finally
 * `app.shortcut`/`shortcutEditor`.
 *
 * Boot-time registration for the File Explorer program — builds the entire
 * shared `app.explorer` API (clipboard, file ops, meta panel widget
 * registry, folder icons, `openWith`/New-submenu wiring) that other system
 * code (recyclebin restore/send, desktop right-click "New", notepad's
 * New-file entries) depends on existing immediately, regardless of whether
 * the Explorer window is ever opened — all boot-critical. The window UI
 * lives in `explorer.js`, lazy-loaded by `app.program.open()` the first time
 * the user actually opens the program.
 *
 * @module components/explorer/setup/index
 */
import { registerIcons } from './icons.js';
import { registerCore } from './core.js';
import { registerFileOps } from './fileops.js';
import { registerIconMenu } from './icon_menu.js';
import { registerDialogs } from './dialogs.js';
import { registerShortcuts } from './shortcuts.js';

export function setup(os) {
    registerIcons(os);
    registerCore(os);
    registerDialogs(os);
    registerFileOps(os);
    registerIconMenu(os);
    registerShortcuts(os);
}
