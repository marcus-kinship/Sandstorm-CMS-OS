/**
 * @file responsivelayout/api.js
 * @description The ONLY code anywhere that reads or writes Responsive Window
 * Layout data in `app.config`. `engine.js` and the Control Panel panel both
 * go through this file exclusively — never `app.config` directly — so
 * swapping the storage layer later (a real backend, per the spec's own
 * "future migration" section) is a one-file change.
 *
 * Config shape, stored at `app.config.get('responsiveWindowLayout', 'config')`:
 * ```
 * {
 *   enabled: true,
 *   snapLayout: { enabled: true },  // drag-to-edge half/quarter snap, independent of `enabled` above
 *   default: {
 *     breakpoints: {mobile,tablet,desktop,largeDesktop},
 *     columns: {mobile,tablet,desktop,largeDesktop},        // max grid columns at each tier — a cap, see engine.js
 *     columnsEnabled: {mobile,tablet,desktop,largeDesktop}, // per-tier on/off for the cap above; off = uncapped
 *     windows: {mobile:{}, tablet:{}, desktop:{}, largeDesktop:{}}
 *   },
 *   users: { [userId]: { windows: {mobile:{}, tablet:{}, desktop:{}, largeDesktop:{}} } }
 * }
 * ```
 * `windows[tier]` maps a **program id** (e.g. `"designer"`, `"notepad"` — the
 * `pid-*` class every window element carries, NOT the ephemeral per-launch
 * window id like `designer-0`) to a captured `{x,y,width,height}` rect.
 *
 * Persistence today is in-memory only (`app.config`), matching the same
 * accepted gap every other Control Panel section has right now (see
 * `cursor/settings-provider.js`'s own header comment). `app.saveUserSettings`
 * doesn't exist anywhere in this codebase yet — every write below calls it
 * only if present, fire-and-forget, never awaited, purely a future
 * persistence hook. Nothing in this module may depend on it existing.
 *
 * Accounts/roles are simulated via the existing (also-cosmetic)
 * `app.config.users` list and its `role` field — no real auth exists in this
 * codebase (`controlpanel/programs/users.js`'s own Add User flow just pushes
 * into an in-memory array regardless of whether its fake API call
 * succeeds). `isAdmin()` checks both `user.profile.role` (the actual shape
 * the boot config in `index.html` uses) and `user.role` (the shape
 * `users.js:200` itself reads, which doesn't match the boot config — a
 * pre-existing mismatch left untouched here, just defended against).
 *
 * @module components/responsivelayout/api
 */

export const TIERS = ['mobile', 'tablet', 'desktop', 'largeDesktop'];

function emptyWindows() {
    return { mobile: {}, tablet: {}, desktop: {}, largeDesktop: {} };
}

function defaultConfig() {
    return {
        enabled: true,
        snapLayout: { enabled: true },
        default: {
            breakpoints: { mobile: 0, tablet: 768, desktop: 1024, largeDesktop: 1440 },
            columns: { mobile: 1, tablet: 2, desktop: 3, largeDesktop: 4 },
            columnsEnabled: { mobile: false, tablet: true, desktop: true, largeDesktop: false },
            windows: emptyWindows()
        },
        users: {}
    };
}

function readConfig() {
    return app.config.get('responsiveWindowLayout', 'config') || null;
}

function writeConfig(config) {
    app.config.set('responsiveWindowLayout', 'config', config);

    if (app.desktop) app.desktop._rwLayoutState = null;

    if (typeof app.saveUserSettings === 'function') {
        try { app.saveUserSettings(); } catch (error) { console.warn('[responsivelayout] saveUserSettings failed:', error); }
    }
}

function ensureConfig() {
    let config = readConfig();
    if (!config) {
        config = defaultConfig();
        writeConfig(config);
    }
    return config;
}

export function getConfig() {
    return readConfig();
}

export function isEnabled() {
    const config = readConfig();
    return !!config && config.enabled === true;
}

export function validate(config) {
    const errors = [];
    if (!config || typeof config !== 'object') {
        return { ok: false, errors: [_('Configuration is missing.')] };
    }
    if (typeof config.enabled !== 'boolean') errors.push(_('"enabled" must be true or false.'));
    if (config.snapLayout !== undefined && typeof config.snapLayout.enabled !== 'boolean') {
        errors.push(_('"snapLayout.enabled" must be true or false.'));
    }

    const bp = config.default?.breakpoints;
    if (!bp || typeof bp !== 'object') {
        errors.push(_('System default breakpoints are missing.'));
    } else {
        TIERS.forEach(tier => {
            if (!Number.isFinite(bp[tier])) errors.push(_('Breakpoint') + ` "${tier}" ` + _('must be a number.'));
        });
        if (Number.isFinite(bp.tablet) && Number.isFinite(bp.mobile) && bp.tablet <= bp.mobile) errors.push(_('Tablet must be greater than Mobile.'));
        if (Number.isFinite(bp.desktop) && Number.isFinite(bp.tablet) && bp.desktop <= bp.tablet) errors.push(_('Desktop must be greater than Tablet.'));
        if (Number.isFinite(bp.largeDesktop) && Number.isFinite(bp.desktop) && bp.largeDesktop <= bp.desktop) errors.push(_('Large Desktop must be greater than Desktop.'));
    }

    const cols = config.default?.columns;
    if (!cols || typeof cols !== 'object') {
        errors.push(_('System default columns are missing.'));
    } else {
        TIERS.forEach(tier => {
            if (!Number.isInteger(cols[tier]) || cols[tier] < 1) errors.push(_('Columns') + ` "${tier}" ` + _('must be a whole number of at least 1.'));
        });
    }
    const colsEnabled = config.default?.columnsEnabled;
    if (!colsEnabled || typeof colsEnabled !== 'object') {
        errors.push(_('System default column toggles are missing.'));
    } else {
        TIERS.forEach(tier => {
            if (typeof colsEnabled[tier] !== 'boolean') errors.push(_('Column toggle') + ` "${tier}" ` + _('must be true or false.'));
        });
    }

    function validateWindows(windows, label) {
        if (!windows || typeof windows !== 'object') { errors.push(label + ' ' + _('windows are missing.')); return; }
        TIERS.forEach(tier => {
            const bucket = windows[tier];
            if (!bucket || typeof bucket !== 'object') { errors.push(label + ' ' + _('is missing tier') + ` "${tier}".`); return; }
            Object.entries(bucket).forEach(([progId, rect]) => {
                if (!progId) { errors.push(label + ' ' + _('has an invalid program id in') + ` "${tier}".`); return; }
                if (!rect || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(rect[k]))) {
                    errors.push(label + ` "${progId}" ` + _('at') + ` "${tier}" ` + _('has an invalid position/size.'));
                } else if (rect.width <= 0 || rect.height <= 0) {
                    errors.push(label + ` "${progId}" ` + _('at') + ` "${tier}" ` + _('must have a positive width and height.'));
                }
            });
        });
    }

    if (config.default) validateWindows(config.default.windows, _('System default'));
    if (config.users && typeof config.users === 'object') {
        Object.entries(config.users).forEach(([userId, layout]) => validateWindows(layout?.windows, _('User') + ` "${userId}"`));
    } else if (config.users !== undefined) {
        errors.push(_('"users" must be an object.'));
    }

    return { ok: errors.length === 0, errors };
}

export function isAvailable() {
    if (!isEnabled()) return false;
    return validate(readConfig()).ok;
}

export function getCurrentUserId() {
    const user = app.config?.user;
    return user?.id || user?.profile?.name || 'local-user';
}

export function isAdmin() {
    const user = app.config?.user;
    const role = user?.profile?.role ?? user?.role;
    return role === 'admin';
}

export function setEnabled(enabled) {
    const config = ensureConfig();
    config.enabled = !!enabled;
    writeConfig(config);
}

/**
 * Snap Layout (drag-to-edge half/quarter snapping) — independent of the
 * grid-arrange `enabled`/`isAvailable()` above. Defaults to on when the
 * field is missing (e.g. a config saved before this setting existed).
 */
export function isSnapEnabled() {
    const config = readConfig();
    if (!config || !config.snapLayout) return true;
    return config.snapLayout.enabled !== false;
}

export function setSnapEnabled(enabled) {
    const config = ensureConfig();
    config.snapLayout = config.snapLayout || {};
    config.snapLayout.enabled = !!enabled;
    writeConfig(config);
}

export function getSystemDefaultLayout() {
    return ensureConfig().default;
}

export function saveSystemDefaultBreakpoints(breakpoints) {
    const config = ensureConfig();
    config.default.breakpoints = { ...config.default.breakpoints, ...breakpoints };
    writeConfig(config);
}

export function saveSystemDefaultColumns(columns) {
    const config = ensureConfig();
    config.default.columns = { ...config.default.columns, ...columns };
    writeConfig(config);
}

export function setColumnsEnabled(tier, enabled) {
    const config = ensureConfig();
    config.default.columnsEnabled = { ...config.default.columnsEnabled, [tier]: !!enabled };
    writeConfig(config);
}

/** Merges `rects` into the system default's windows[tier] bucket — never touches other tiers. */
export function saveSystemDefaultLayout(tier, rects) {
    const config = ensureConfig();
    config.default.windows = config.default.windows || emptyWindows();
    config.default.windows[tier] = { ...rects };
    writeConfig(config);
}

export function getUserLayout(userId) {
    const config = ensureConfig();
    return config.users[userId] || null;
}

/** Merges `rects` into userId's windows[tier] bucket — never touches other tiers or other users. */
export function saveUserLayout(userId, tier, rects) {
    const config = ensureConfig();
    config.users[userId] = config.users[userId] || { windows: emptyWindows() };
    config.users[userId].windows[tier] = { ...rects };
    writeConfig(config);
}

/** Clears only this user's override for one tier — other tiers and the system default are untouched. */
export function resetUserLayout(userId, tier) {
    const config = ensureConfig();
    if (config.users[userId]?.windows) {
        config.users[userId].windows[tier] = {};
        writeConfig(config);
    }
}

/**
 * Centralized priority resolution for ONE breakpoint tier — the only place
 * "user layout, else system default, else nothing" is decided. Never mixes
 * tiers: a rect only ever comes from the same tier being asked about.
 * @returns {{source: 'user'|'system-default'|'auto', rects: Object}}
 */
export function getResponsiveLayout(userId, tier) {
    const config = readConfig();
    if (!config) return { source: 'auto', rects: {} };

    const userRects = config.users?.[userId]?.windows?.[tier];
    if (userRects && Object.keys(userRects).length) return { source: 'user', rects: userRects };

    const defaultRects = config.default?.windows?.[tier];
    if (defaultRects && Object.keys(defaultRects).length) return { source: 'system-default', rects: defaultRects };

    return { source: 'auto', rects: {} };
}

export function resolveTier(width, breakpoints) {
    if (width >= breakpoints.largeDesktop) return 'largeDesktop';
    if (width >= breakpoints.desktop) return 'desktop';
    if (width >= breakpoints.tablet) return 'tablet';
    return 'mobile';
}

function programIdOf(el) {
    const classes = (el.className || '').split(' ');
    for (const c of classes) if (c.startsWith('pid-')) return c.slice(4);
    return null;
}

/** Reads every currently-open window's live on-screen rect, keyed by program id — for Save Layout. */
export function captureCurrentLayout() {
    const rects = {};
    $('.window:visible').each(function () {
        const pid = programIdOf(this);
        if (!pid || pid === 'sandstormscomponents') return;
        const $el = $(this);
        rects[pid] = {
            x: parseFloat($el.css('left')) || 0,
            y: parseFloat($el.css('top')) || 0,
            width: $el.outerWidth(),
            height: $el.outerHeight()
        };
    });
    return rects;
}

export function init(app) {
    ensureConfig();

    app.responsiveLayout = app.responsiveLayout || {};
    app.responsiveLayout.api = {
        TIERS, getConfig, isEnabled, isAvailable, validate,
        getCurrentUserId, isAdmin, setEnabled,
        isSnapEnabled, setSnapEnabled,
        getSystemDefaultLayout, saveSystemDefaultBreakpoints, saveSystemDefaultColumns, setColumnsEnabled, saveSystemDefaultLayout,
        getUserLayout, saveUserLayout, resetUserLayout,
        getResponsiveLayout, resolveTier, captureCurrentLayout
    };
}
