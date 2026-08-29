/**
 * @file cursor/index.js
 * @description Assembler — the ONLY module in this feature allowed to import
 * from more than one sibling; every other file here imports from at most one
 * shared leaf module. Loads the initial pack, seeds `state.js` from
 * `settings-provider.js`, starts `detect.js`/`motion.js`, initializes
 * `renderer.js`, then attaches the public surface as `app.cursor` and
 * `window.Cursor` (the spec's own bare `Cursor.move(...)` call style) and
 * locks the namespace — mirrors every other boot-time `app.lock('x.*', ...)`
 * call already in `load.js`.
 *
 * A boot-loaded `systemfiles` entry (not lazy) — the cursor overlay must be
 * live from first paint, so this module runs its own init at the top level
 * instead of just registering a factory the way `ui/caret.js` does. It must
 * load AFTER `svg.js`/`svg-morph.js` in `load.js`'s `systemfiles`, since
 * `pack-loader.js` calls `app.svg.global.load(...)` during this module's own
 * top-level `await`.
 *
 * @module components/cursor/index
 */

import * as state from './state.js';
import * as settingsProvider from './settings-provider.js';
import { loadPack } from './pack-loader.js';
import * as detect from './detect.js';
import * as motion from './motion.js';
import * as renderer from './renderer.js';
import * as api from './api.js';

const settings = settingsProvider.load();
state.initSettings(settings);

const manifest = await loadPack(settings.pack);
state.setPack(manifest);
renderer.setPackManifest(manifest);

renderer.init();
detect.start();
motion.start();

if (window.__sandstormBootMouse) {
    const { x, y } = window.__sandstormBootMouse;
    state.setTarget(x, y);
    motion.snapTo(x, y);
    detect.resync();
}

const cursorApi = {
    move: api.move,
    set: api.set,
    systemSet: api.systemSet,
    startWorking: api.startWorking,
    stopWorking: api.stopWorking,
    show: api.show,
    hide: api.hide,
    lock: api.lock,
    unlock: api.unlock,
    follow: api.follow,
    invalidate: api.invalidate,
    settings: api.settings,
    register: api.register,
    enable: api.enable,
    disable: api.disable,
    isEnabled: api.isEnabled,
    getSettings: api.getSettings,
    reset: api.reset,
    permission: api.permission,
    version: api.version,
};

app.cursor = cursorApi;
window.Cursor = cursorApi;
app.lock('cursor.*', { writable: false, configurable: false });
