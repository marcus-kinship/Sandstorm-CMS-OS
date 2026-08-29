/**
 * @file search/recent.js
 * @description localStorage-backed "opened via search" tracker — the `+10`
 * ranking bonus `search/manager.js` applies. Persisted directly to
 * `localStorage` (formbuilder.js's pattern — `app.config.user.settings` is
 * never actually flushed anywhere in this repo).
 *
 * Only tracks items actually launched through the search UI (see
 * `startmenu/search.js`'s Enter/click handler calling `recordOpen()`), not
 * every app-open in the OS generally — `app.program.open` is locked and not
 * safely hookable from outside, so this is a deliberately narrower scope
 * than a system-wide "recently used" tracker.
 *
 * @module components/search/recent
 */
const STORAGE_KEY = 'sandstorm_search_recent';
const MAX_ENTRIES = 20;
const BONUS = 10;

let _cache = null;

function _load() {
    if (_cache) return _cache;
    try {
        const stored = window.localStorage?.getItem(STORAGE_KEY);
        _cache = stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.warn('Search recent localStorage load failed:', error);
        _cache = [];
    }
    return _cache;
}

function _save() {
    try {
        window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(_cache));
    } catch (error) {
        console.warn('Search recent localStorage save failed:', error);
    }
}

/** @param {string} id - A SearchResult's `id`. */
export function recordOpen(id) {
    const list = _load().filter(entry => entry !== id);
    list.unshift(id);
    _cache = list.slice(0, MAX_ENTRIES);
    _save();
}

/** @param {string} id @returns {number} `BONUS` if recently opened via search, else 0. */
export function bonus(id) {
    return _load().includes(id) ? BONUS : 0;
}

/** @returns {string[]} Most-recent-first list of result ids. */
export function list() {
    return _load().slice();
}
