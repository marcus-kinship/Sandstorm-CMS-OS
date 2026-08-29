/**
 * @file notifications/api.js
 * @description Public logic behind `app.notifications` — routing a `notify()`
 * call to the clock's notification list and/or a program's own registered
 * surface, per the global program-mode setting and each program's own
 * preference (see design spec, sections 5-8).
 *
 * Imports only `state.js` (this feature's shared leaf module), matching the
 * one-sibling-import convention documented in `cursor/index.js`.
 *
 * "Who is calling" is resolved via the same convention-based DOM lookup as
 * `cursor/permission.js` (`.window.active`'s `pid-<id>` class) — not a
 * security boundary, just consent/routing context. Unlike the cursor engine,
 * showing a notification isn't a "dangerous" capability, so there is no
 * runtime consent dialog here — only the routing preferences exposed on the
 * Notifications Control Panel tile.
 *
 * @module components/notifications/api
 */

import * as state from './state.js';

const PRIORITIES = ['info', 'warning', 'critical'];

/** @type {Map<string, function>} programId -> renderer for that program's own surface */
const _surfaces = new Map();

/** @type {Set<function>} */
const _listeners = new Set();

function _emit() {
    for (const fn of _listeners) {
        try { fn(); } catch (error) { console.warn('notifications onChange listener failed:', error); }
    }
}

function _uid() {
    return 'ntf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/** Convention-based "who is calling" — see file header. Returns `null` for
 *  a system-level call (no active program window, e.g. during boot). */
function getCallerProgramId() {
    const activeWindow = document.querySelector('.window.active');
    const cls = activeWindow?.getAttribute('class') || '';
    const match = cls.match(/pid-([^\s]+)/);
    return match ? match[1] : null;
}

/**
 * Creates and routes a notification.
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} [opts.body='']
 * @param {string} [opts.icon]
 * @param {'info'|'warning'|'critical'} [opts.priority='info']
 * @param {string} [opts.programId] - Defaults to the calling program (DOM
 *   convention) or `'system'` for a trusted system-level call.
 * @param {Array} [opts.actions=[]]
 * @returns {string|null} The notification id, or `null` if dropped (blocked
 *   program mode and not critical, or no title given).
 */
export function notify({ title, body = '', icon, priority = 'info', programId, actions = [] } = {}) {
    if (!title) return null;
    if (!PRIORITIES.includes(priority)) priority = 'info';

    const resolvedProgramId = programId || getCallerProgramId() || 'system';
    const isSystem = resolvedProgramId === 'system';
    const mode = state.getSettings().programMode;

    if (!isSystem && mode === 'blocked' && priority !== 'critical') {
        return null;
    }

    let route = 'clock';
    if (!isSystem) {
        route = (mode === 'all-at-clock')
            ? 'clock'
            : (state.getProgramPref(resolvedProgramId) || (_surfaces.has(resolvedProgramId) ? 'own' : 'clock'));
    }

    const entry = {
        id: _uid(),
        programId: resolvedProgramId,
        title,
        body,
        icon: icon || null,
        priority,
        timestamp: Date.now(),
        read: false,
        actions,
    };

    const showsAtClock = isSystem || route === 'clock' || route === 'both' || priority === 'critical';
    const showsOwn = !isSystem && (route === 'own' || route === 'both') && _surfaces.has(resolvedProgramId);

    let addedToClock = false;
    if (showsAtClock) {
        const list = state.getNotifications();
        list.unshift(entry);
        state.setNotifications(list);
        addedToClock = true;
    }

    if (showsOwn) {
        try { _surfaces.get(resolvedProgramId)(entry); } catch (error) { console.warn('notification surface render failed:', error); }
    } else if (!addedToClock) {
        const list = state.getNotifications();
        list.unshift(entry);
        state.setNotifications(list);
    }

    _emit();
    return entry.id;
}

export function dismiss(id) {
    state.setNotifications(state.getNotifications().filter(n => n.id !== id));
    _emit();
}

export function clear() {
    state.setNotifications([]);
    _emit();
}

/** @returns {Array<Object>} A shallow copy of the clock's notification list, newest first. */
export function list() {
    return state.getNotifications().slice();
}

/** Marks every clock notification as seen — clears the taskbar badge without deleting entries. */
export function markAllSeen() {
    const notifications = state.getNotifications();
    let changed = false;
    for (const n of notifications) {
        if (!n.read) { n.read = true; changed = true; }
    }
    if (changed) {
        state.setNotifications(notifications);
        _emit();
    }
}

/** @returns {'none'|'info'|'warning'} Badge state per the design spec (§1). */
export function getBadgeState() {
    const unread = state.getNotifications().filter(n => !n.read);
    if (!unread.length) return 'none';
    return unread.some(n => n.priority === 'critical' || n.priority === 'warning') ? 'warning' : 'info';
}

export function onChange(fn) { _listeners.add(fn); }
export function offChange(fn) { _listeners.delete(fn); }

/** Lets a program register its own notification surface (e.g. a game's HUD). */
export function registerSurface(programId, fn) { _surfaces.set(programId, fn); }
export function unregisterSurface(programId) { _surfaces.delete(programId); }

export const settings = {
    get: () => state.getSettings(),
    set: (partial) => { state.setSettings(partial); _emit(); },
};

export const programPref = {
    get: (programId) => state.getProgramPref(programId),
    set: (programId, pref) => { state.setProgramPref(programId, pref); _emit(); },
    list: () => state.listProgramPrefs(),
};

export { getCallerProgramId };
