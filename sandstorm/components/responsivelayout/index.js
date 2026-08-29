/**
 * @file responsivelayout/index.js
 * @description Boot entrypoint for the Responsive Window Layout module.
 * Registered in `load.js`'s `programs` array (`root: "components"`, same
 * tier as `search/index.js`), so `app.includeProgram` requires this file to
 * export `setup(app)` (not `init`) — see `sandstorm/core/modules.js:186-194`.
 *
 * `programs` array entries load sequentially and fully complete (including
 * this file's own `setup()`) before the boot `start` sequence runs — the
 * step that actually creates the first windows/desktop icons — so `engine.js`
 * can wire up its resize listener/MutationObserver/first arrange pass here,
 * eagerly, with zero risk of a window existing yet. This replaces the old
 * lazy-on-first-window-creation trigger `desktop.js`'s own
 * `responsiveWindows()` used to be (see that file's now-inert stub).
 *
 * `app.includeProgram` unconditionally calls `app.program.add()` right after
 * `setup()` returns (`sandstorm/core/modules.js:195`), so — same as
 * `search/index.js` — `addInfo` must be called here too (startmenu/taskbar
 * both false) purely so that `add()` doesn't log its "no program ID set"
 * warning.
 *
 * @module components/responsivelayout/index
 */

import { init as initApi } from './api.js';
import { init as initEngine } from './engine.js';

export function setup(app) {
    app.program.addInfo('responsivelayout', {
        name: () => _('Responsive Window Layout'),
        version: '1.0',
        owner: 'Marcus Larsson',
        description: () => _('Per-breakpoint saved window layouts'),
        icontype: 'svg',
        icon: '#ic-controlpanel',
        taskbar: false,
        startmenu: false,
        multistart: false,
        main: 'start',
        programtype: 'system',
    });

    initApi(app);
    initEngine(app);
}

export function start() { }
