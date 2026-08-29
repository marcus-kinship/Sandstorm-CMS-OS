/**
 * @file cursor/cursor-map.js
 * @description Maps the CSS `cursor` value already computed on whatever
 * element is under the pointer to one of the engine's internal cursor ids.
 * This is the ONLY file that knows about raw CSS cursor names — `detect.js`
 * is the only consumer; `renderer.js` never sees a CSS cursor value, only
 * the resolved internal id this file (or registry.js, for custom types)
 * produces.
 *
 * Reuses the `cursor:` values already declared throughout the OS (110×
 * `pointer`, 82× `default`, plus `move`/`text`/`resize`/etc.) as pure
 * semantic metadata — none of those ~216 declarations across 58 files were
 * touched to build this engine; they're read, never rendered natively,
 * since a single global `cursor: none !important` rule suppresses native
 * rendering while the engine is active (see renderer.js).
 *
 * @module components/cursor/cursor-map
 */

export const CURSOR_MAP = {
    default:     'cursor-normal',
    auto:        'cursor-normal',
    pointer:     'cursor-link',
    text:        'cursor-text',
    move:        'cursor-move',
    help:        'cursor-help',
    wait:        'cursor-busy',
    progress:    'cursor-working',
    'not-allowed': 'cursor-unavailable',
    'no-drop':     'cursor-unavailable',
    crosshair:   'cursor-crosshair',
    grab:        'cursor-move',
    grabbing:    'cursor-move',
    'ew-resize':   'cursor-resize-h',
    'ns-resize':   'cursor-resize-v',
    'nwse-resize': 'cursor-resize-d1',
    'nesw-resize': 'cursor-resize-d2',
    'e-resize':  'cursor-resize-h',
    'w-resize':  'cursor-resize-h',
    'n-resize':  'cursor-resize-v',
    's-resize':  'cursor-resize-v',
    'nw-resize': 'cursor-resize-d1',
    'se-resize': 'cursor-resize-d1',
    'ne-resize': 'cursor-resize-d2',
    'sw-resize': 'cursor-resize-d2',
    'row-resize': 'cursor-resize-v',
    'col-resize': 'cursor-resize-h',
};

export const FALLBACK_CURSOR_ID = 'cursor-normal';

/**
 * @param {string} computedValue - e.g. `getComputedStyle(el).cursor`.
 * @returns {string|null} An internal cursor id (e.g. `"cursor-link"`), or
 *   `null` if unrecognized — callers fall back to `FALLBACK_CURSOR_ID`
 *   themselves after also checking registry.js's dynamic aliases.
 */
export function resolveCSSCursor(computedValue) {
    return CURSOR_MAP[computedValue] || null;
}
