/**
 * @file cursor/theme.js
 * @description Theme Manager — color/glow/shadow/opacity, fully independent
 * of which pack (shape) is currently showing. A pack can be displayed in any
 * theme; nothing here ever touches an SVG file or the active-cursor-id
 * selection logic (that's `cursor-map.js`/`registry.js`/`detect.js`).
 *
 * Applies as CSS custom properties on `document.documentElement`, the same
 * mechanism `app.setCSSVariable` uses for the rest of the OS's theming
 * (`sandstorm/ui/css.js`) — `renderer.js`'s own CSS reads these vars, it
 * never computes colors itself.
 *
 * @module components/cursor/theme
 */

const ACCENT_DEFAULT_HEX = '#ffffff'; // matches customized.js's own defaultTheme.backgroundRadialColor
function _accentHex() {
    return app.config?.user?.settings?.theme?.backgroundRadialColor || ACCENT_DEFAULT_HEX;
}

function _accentPreset() {
    const hex = _accentHex();
    return { color: hex, glow: 'none', shadow: '1px 2px 3px rgba(0,0,0,0.4)', opacity: 1 };
}

const PRESETS = {
    white: { color: '#ffffff', glow: 'none', shadow: '1px 2px 3px rgba(0,0,0,0.5)', opacity: 1 },
    black: { color: '#000000', glow: 'none', shadow: '1px 2px 3px rgba(255,255,255,0.3)', opacity: 1 },
};

let _current = { name: 'accent', ..._accentPreset() };

/**
 * @param {string|Object} nameOrObject - A preset name ("accent"/"white"/"black"),
 *   or a custom `{color, glow, shadow, opacity}` object (any fields omitted
 *   fall back to the current theme's values — used for the Control Panel's
 *   "Custom" color swatch, which only ever supplies `color`).
 */
export function applyTheme(nameOrObject) {
    const base = typeof nameOrObject === 'string'
        ? (nameOrObject === 'accent' ? _accentPreset() : (PRESETS[nameOrObject] || _accentPreset()))
        : { ..._current, ...nameOrObject };

    _current = {
        name: typeof nameOrObject === 'string' ? nameOrObject : 'custom',
        color:   base.color   ?? _accentHex(),
        glow:    base.glow    ?? 'none',
        shadow:  base.shadow  ?? '1px 2px 3px rgba(0,0,0,0.4)',
        opacity: base.opacity ?? 1,
    };

    const root = document.documentElement;
    root.style.setProperty('--cursor-color',   _current.color);
    root.style.setProperty('--cursor-glow',    _current.glow);
    root.style.setProperty('--cursor-shadow',  _current.shadow);
    root.style.setProperty('--cursor-opacity', String(_current.opacity));

    return { ..._current };
}

export function getTheme() {
    return { ..._current };
}

export function listPresets() {
    return ['accent', ...Object.keys(PRESETS)];
}
