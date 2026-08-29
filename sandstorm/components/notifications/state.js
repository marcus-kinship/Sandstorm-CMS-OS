/**
 * @file notifications/state.js
 * @description Persistence layer for the notification system — the shared
 * leaf module every other file in this feature imports from (same
 * one-sibling-import convention as `cursor/*.js`). Holds the notification
 * list, polling/placement settings, the global program-routing mode, and
 * per-program routing preferences.
 *
 * Persisted directly to `localStorage` (formbuilder.js's pattern) rather than
 * through `app.config.user.settings` — that path is never actually flushed
 * anywhere in this codebase (see cursor/settings-provider.js's own note on
 * `os.saveUserSettings` not existing), and notifications must survive reload.
 *
 * @module components/notifications/state
 */

const STORAGE_KEY = "sandstorm_notifications_state";

let _state = null;

function _defaults() {
    return {
        notifications: [],   // { id, programId, title, body, icon, priority, timestamp, read, actions }
        pollInterval: '5m',  // '30s' | '1m' | '5m' | '10m' | '30m' | 'manual'
        placement: 'clock',  // 'clock' | 'right' | 'corner' | 'custom'
        programMode: 'allow-own', // 'allow-own' | 'all-at-clock' | 'blocked'
        programPrefs: {},    // programId -> 'own' | 'clock' | 'both'
    };
}

/**
 * Loads (and caches) state from localStorage, merging stored values over
 * defaults so an older/partial shape never crashes on a missing field.
 * @returns {Object}
 */
export function load() {
    if (_state) return _state;

    let parsed = null;
    try {
        if (window.localStorage) {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            parsed = stored ? JSON.parse(stored) : null;
        }
    } catch (error) {
        console.warn('Notifications localStorage load failed:', error);
    }

    _state = Object.assign(_defaults(), parsed || {});
    _state.notifications = Array.isArray(_state.notifications) ? _state.notifications : [];
    _state.programPrefs = _state.programPrefs && typeof _state.programPrefs === 'object' ? _state.programPrefs : {};

    return _state;
}

function _save() {
    try {
        if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch (error) {
        console.warn('Notifications localStorage save failed:', error);
    }
}

export function getNotifications() {
    return load().notifications;
}

export function setNotifications(list) {
    load().notifications = list;
    _save();
}

/** @returns {{pollInterval:string, placement:string, programMode:string}} */
export function getSettings() {
    const s = load();
    return { pollInterval: s.pollInterval, placement: s.placement, programMode: s.programMode };
}

/** @param {{pollInterval?:string, placement?:string, programMode?:string}} partial */
export function setSettings(partial) {
    const s = load();
    if (partial.pollInterval !== undefined) s.pollInterval = partial.pollInterval;
    if (partial.placement !== undefined) s.placement = partial.placement;
    if (partial.programMode !== undefined) s.programMode = partial.programMode;
    _save();
}

export function getProgramPref(programId) {
    return load().programPrefs[programId];
}

export function setProgramPref(programId, pref) {
    load().programPrefs[programId] = pref;
    _save();
}

/** @returns {Object<string,string>} shallow copy of programId -> pref */
export function listProgramPrefs() {
    return Object.assign({}, load().programPrefs);
}
