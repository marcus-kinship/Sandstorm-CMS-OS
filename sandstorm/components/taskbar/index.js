/**
 * @file taskbar/index.js
 * @description Taskbar component — final assembly point. Side-effect
 * imports every remaining piece of the original monolithic `index.js`
 * (each a self-registering IIFE extending `app.desktop.taskbar`, exactly
 * like the pre-existing sibling modules config.js/overflow.js/menu.js/
 * sort.js this file is loaded after — see `load.js`'s systemfiles order),
 * then locks the fully-assembled `app.desktop.taskbar` object.
 *
 * Split into `taskbar/notify.js`, `taskbar/icons.js`,
 * `taskbar/statusicons.js`, `taskbar/addtotaskbar.js`,
 * `taskbar/windowanim.js`, `taskbar/clock.js`, `taskbar/showdesktop.js`,
 * `taskbar/build.js`, and `taskbar/core.js` — this file is now just the side-effect entry point
 * `load.js`'s systemfiles list imports, unchanged path, same external
 * behavior. The browser's native ES module loader fetches every
 * statically-imported sibling below in parallel; each executes (in the
 * import-statement order below) before this file's own trailing
 * `app.lock()` calls run.
 *
 * @namespace app.desktop.taskbar
 */
import "./notify.js";
import "./icons.js";
import "./statusicons.js";
import "./addtotaskbar.js";
import "./windowanim.js";
import "./clock.js";
import "./showdesktop.js";
import "./build.js";
import "./core.js";

(function (app) {
    app.lock('desktop.*', { writable: false, configurable: false });
    app.lock('desktop.taskbar.*', { writable: false, configurable: false });
})((window.app = window.app || {}));
