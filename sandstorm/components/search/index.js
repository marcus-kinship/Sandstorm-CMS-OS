/**
 * @file search/index.js
 * @description Assembler for the global search system — registers the 4
 * built-in providers (apps/settings/commands/filesystem) with the manager,
 * then exposes `app.search = { query, registerProvider }`.
 *
 * Locked as a top-level property — `app.lock('search', ...)`, deliberately
 * NOT `'search.*'` — so `app.search` itself can't be reassigned, but
 * `app.search.registerProvider(...)` stays callable for future providers
 * (an online provider, once a real backend exists — see manager.js's own
 * note on that; nothing in this pass builds or wires one).
 *
 * Loaded as a regular `programs` entry (not an early systemfile): nothing
 * calls `app.search.query()` until the user types in the Start Menu, by
 * which point `app.program`/`app.explorer`/`app.searchengine` are all long
 * booted. Registered via `addInfo` (startmenu/taskbar both false) purely so
 * `app.program.add()` doesn't log its "no program ID set" warning — same
 * pattern as `notifications/setup.js`.
 *
 * @module components/search/index
 */
import * as manager from './manager.js';
import { search as appsSearch } from './providers/apps.js';
import { search as settingsSearch } from './providers/settings.js';
import { search as commandsSearch } from './providers/commands.js';
import { search as filesystemSearch } from './providers/filesystem.js';

export function setup(os) {
    os.program.addInfo('search', {
        name: () => _('Search'),
        version: '1.0',
        owner: 'Marcus Larsson',
        description: () => _('Global search — apps, settings, files, and commands'),
        icontype: 'svg',
        icon: '#ic-search',
        taskbar: false,
        startmenu: false,
        multistart: false,
        main: 'start',
        programtype: 'system',
    });

    manager.registerProvider('apps', { weight: 20, search: appsSearch });
    manager.registerProvider('settings', { weight: 15, search: settingsSearch });
    manager.registerProvider('commands', { weight: 10, search: commandsSearch });
    manager.registerProvider('filesystem', { weight: 0, search: filesystemSearch });

    os.search = {
        query: manager.query,
        registerProvider: manager.registerProvider,
    };
    os.lock('search', { writable: false, configurable: false });
}

export function start() { }
