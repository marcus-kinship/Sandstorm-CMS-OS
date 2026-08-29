/**
 * @file cursor/settings-provider.js
 * @description The ONLY file in the Cursor Engine that knows how settings
 * are actually persisted. Today that's the same best-effort shape
 * `sandstorm/components/controlpanel/programs/customized.js`/`language.js`
 * already use: mutate `app.config.user.settings.cursor`, debounce, call
 * `os.saveUserSettings()` if it exists.
 *
 * IMPORTANT, confirmed pre-existing gap (not introduced or fixed by this
 * file): `os.saveUserSettings` is never defined anywhere in this repo, and
 * there's no `localStorage` usage anywhere either — so today, settings
 * changes do NOT survive a real page reload, exactly like every other
 * Control Panel section's settings. This file exists specifically so that
 * whenever a real backing store is wired up (localStorage, a CMS settings
 * endpoint, cloud sync), it's a one-file change — `state.js`/`api.js` never
 * talk to `app.config.user` directly.
 *
 * @module components/cursor/settings-provider
 */

export const DEFAULT_SETTINGS = {
    enabled: true,
    cssCursorAlso: false, // "Aktivera CSS cursor" — native cursor visible alongside the overlay
    pack: 'standard',
    theme: 'accent',
    size: 24,
    speed: 0.8,           // 0..1, spec's "0-100% eller 1-10" normalized to 0..1
    smoothness: 'medium', // 'none' | 'low' | 'medium' | 'high'
    animations: { idle: true, busy: true, hover: true, click: true, trail: true },
    security: {
        askBeforeControl: true,
        systemOnly: false,
        showUsage: true,
    },
};

let _saveTimeout = null;

/**
 * @returns {Object} A fresh copy of the persisted settings, or `DEFAULT_SETTINGS` if none exist yet.
 */
export function load() {
    const stored = app.config?.user?.settings?.cursor;
    if (!stored) return { ...DEFAULT_SETTINGS };
    return {
        ...DEFAULT_SETTINGS,
        ...stored,
        animations: { ...DEFAULT_SETTINGS.animations, ...(stored.animations || {}) },
        security:   { ...DEFAULT_SETTINGS.security,   ...(stored.security   || {}) },
    };
}

/**
 * @param {Object} settings - The full settings object to persist (debounced 500ms, matching customized.js).
 */
export function save(settings) {
    if (!app.config.user) app.config.user = {};
    if (!app.config.user.settings) app.config.user.settings = {};
    app.config.user.settings.cursor = { ...settings };

    clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => {
        if (typeof app.saveUserSettings === "function") app.saveUserSettings();
    }, 500);
}
