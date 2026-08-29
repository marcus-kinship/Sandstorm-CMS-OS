/**
 * @file notifications/index.js
 * @description Assembler for the notification system's core API — imports
 * `state.js` and `api.js`, assembles the public surface, and attaches it as
 * `app.notifications` (locked, same `app.lock('x.*', ...)` convention as
 * every other boot-time feature in `load.js`).
 *
 * Boot-loaded (not lazy) so any program — including ones loaded very early —
 * can call `app.notifications.notify(...)` from its own `setup()`. Has no
 * dependency on the taskbar; the clock-area bell icon and its popup panel are
 * separate UI wiring in `notifications/setup.js`, loaded later as a regular
 * program (after the taskbar's DOM exists).
 *
 * @module components/notifications/index
 */

import * as state from './state.js';
import * as api from './api.js';

state.load();

const notificationsApi = {
    notify: api.notify,
    dismiss: api.dismiss,
    clear: api.clear,
    list: api.list,
    markAllSeen: api.markAllSeen,
    getBadgeState: api.getBadgeState,
    onChange: api.onChange,
    offChange: api.offChange,
    registerSurface: api.registerSurface,
    unregisterSurface: api.unregisterSurface,
    settings: api.settings,
    programPref: api.programPref,
    version: '1.0.0',
};

app.notifications = notificationsApi;
app.lock('notifications.*', { writable: false, configurable: false });
