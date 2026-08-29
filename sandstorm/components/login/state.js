/**
 * @file login/state.js
 * @description Persistence layer for the login screen's own settings
 * (language override, auto-lock timeout, background image override).
 *
 * Persisted directly to `localStorage` (same pattern as
 * `notifications/state.js`/`search/recent.js`) rather than through
 * `app.config.user.settings` — `os.saveUserSettings()` is called elsewhere
 * in this codebase but defined nowhere, so that path never actually
 * survives a reload.
 *
 * @module components/login/state
 */

const STORAGE_KEY = "sandstorm_login_state";

let _state = null;

function _defaults() {
    return {
        language: "system",     // "system" | an installed ISO 639-1 code
        timeout: 300,           // seconds; 0 = "Never"
        backgroundImage: null,  // string URL, or null = follow the desktop's current background
    };
}

/**
 * Validates a candidate background-image URL: must be a common raster image
 * extension (query/hash suffixes allowed after it), and if it carries a URI
 * scheme, that scheme must be http/https — rejects `data:`, `javascript:`,
 * `blob:`, etc. up front regardless of what extension-like text follows.
 * @param {string} url
 * @returns {boolean}
 */
export function isValidBackgroundImageUrl(url) {
    if (typeof url !== "string" || !url) return false;

    const stripped = url.split(/[?#]/)[0];

    const schemeMatch = stripped.match(/^([a-z][a-z0-9+.-]*):/i);
    if (schemeMatch && !/^https?$/i.test(schemeMatch[1])) return false;

    return /\.(jpe?g|png|gif|webp|bmp)$/i.test(stripped);
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
        console.warn('Login localStorage load failed:', error);
    }

    _state = Object.assign(_defaults(), parsed || {});
    if (_state.backgroundImage && !isValidBackgroundImageUrl(_state.backgroundImage)) {
        _state.backgroundImage = null;
    }

    return _state;
}

function _save() {
    try {
        if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch (error) {
        console.warn('Login localStorage save failed:', error);
    }
}

export function get() {
    return load();
}

/**
 * @param {{language?:string, timeout?:number, backgroundImage?:(string|null)}} partial
 * An invalid `backgroundImage` (fails `isValidBackgroundImageUrl`) is
 * silently dropped rather than persisted — this is the single chokepoint
 * every caller (login.js, the Control Panel picker) goes through.
 */
export function set(partial) {
    const s = load();
    if (partial.language !== undefined) s.language = partial.language;
    if (partial.timeout !== undefined) s.timeout = partial.timeout;
    if (partial.backgroundImage !== undefined) {
        if (partial.backgroundImage === null || isValidBackgroundImageUrl(partial.backgroundImage)) {
            s.backgroundImage = partial.backgroundImage;
        } else {
            console.warn('Login: rejected invalid backgroundImage URL:', partial.backgroundImage);
        }
    }
    _save();
}
