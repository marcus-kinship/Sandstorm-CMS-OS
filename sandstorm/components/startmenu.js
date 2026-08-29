/**
 * @file startmenu.js
 * @description Start menu controller for Sandstorm OS.
 *
 * Extends `app.desktop.startmenu` with the full start menu UI: tabs, running-apps panel,
 * logoff/help buttons, keyboard shortcut toggle, and an extensible tab system.
 *
 * Split into `startmenu/state.js`, `startmenu/tabs.js`, `startmenu/running_apps.js`,
 * `startmenu/taskbar_dock.js`, `startmenu/buttons.js`, `startmenu/core.js`, and
 * `startmenu/index.js` (the assembler) — this file is now just the side-effect
 * entry point `load.js`'s `systemfiles` list imports, unchanged path, same
 * external behavior. The browser's native ES module loader fetches every
 * statically-imported sibling below in parallel; `index.js`'s own imports
 * then execute in the dependency order the module graph guarantees.
 *
 * @module components/startmenu
 */
import "./startmenu/index.js";
