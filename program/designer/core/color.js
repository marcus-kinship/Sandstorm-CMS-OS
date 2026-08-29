/**
 * @file designer/core/color.js
 * @description Pure color parsing/conversion/serialization helpers shared by
 * every color-related Designer file (designer_color_element.js,
 * designer_color_history.js, designer_color_picker_window.js,
 * tools/colorpickup.js, core/style.js). No DOM, no `app` state — imported
 * directly like `core/style.js`'s `buildStyle`, not registered via
 * `app.includeModule`/`init(app)`.
 *
 * `normalizeColor()`'s `{r,g,b,a,hex}` shape (alpha always a 0-1 float) is
 * the single source of truth every other file's alpha handling defers to —
 * nothing else in the color system re-derives its own alpha scaling.
 *
 * @module program/designer/core/color
 */

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

function clampByte(n) {
    return clamp(Math.round(n), 0, 255);
}

function clampAlpha(a) {
    return clamp(a, 0, 1);
}

/**
 * @param {string} hex - `#rgb`, `#rgba`, `#rrggbb`, or `#rrggbbaa` (CSS4 byte order).
 * @returns {{r:number,g:number,b:number,a:number}|null}
 */
export function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    const s = hex.trim().replace(/^#/, '');

    let r, g, b, a = 1;
    if (s.length === 3 || s.length === 4) {
        r = parseInt(s[0] + s[0], 16);
        g = parseInt(s[1] + s[1], 16);
        b = parseInt(s[2] + s[2], 16);
        if (s.length === 4) a = parseInt(s[3] + s[3], 16) / 255;
    } else if (s.length === 6 || s.length === 8) {
        r = parseInt(s.slice(0, 2), 16);
        g = parseInt(s.slice(2, 4), 16);
        b = parseInt(s.slice(4, 6), 16);
        if (s.length === 8) a = parseInt(s.slice(6, 8), 16) / 255;
    } else {
        return null;
    }
    if ([r, g, b].some(Number.isNaN) || Number.isNaN(a)) return null;
    return { r, g, b, a: clampAlpha(a) };
}

/**
 * @param {{r:number,g:number,b:number,a?:number}} rgb
 * @returns {string} `#rrggbb` when alpha is 1, otherwise `#rrggbbaa` (CSS4 order).
 */
export function rgbToHex({ r, g, b, a = 1 }) {
    const toByte = n => clampByte(n).toString(16).padStart(2, '0');
    const base = `#${toByte(r)}${toByte(g)}${toByte(b)}`;
    return clampAlpha(a) === 1 ? base : base + toByte(clampAlpha(a) * 255);
}

/**
 * @param {{r:number,g:number,b:number}} rgb - 0-255 each.
 * @returns {{h:number,s:number,v:number}} h in 0-360, s/v in 0-1.
 */
export function rgbToHsv({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const d = max - min;

    let h = 0;
    if (d !== 0) {
        if (max === rn) h = ((gn - bn) / d) % 6;
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }

    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
}

/**
 * @param {{h:number,s:number,v:number}} hsv - h in 0-360, s/v in 0-1.
 * @returns {{r:number,g:number,b:number}} 0-255 each.
 */
export function hsvToRgb({ h, s, v }) {
    const c = v * s;
    const hh = ((h % 360) + 360) % 360 / 60;
    const x = c * (1 - Math.abs(hh % 2 - 1));
    let r1, g1, b1;
    if (hh < 1) [r1, g1, b1] = [c, x, 0];
    else if (hh < 2) [r1, g1, b1] = [x, c, 0];
    else if (hh < 3) [r1, g1, b1] = [0, c, x];
    else if (hh < 4) [r1, g1, b1] = [0, x, c];
    else if (hh < 5) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    const m = v - c;
    return { r: clampByte((r1 + m) * 255), g: clampByte((g1 + m) * 255), b: clampByte((b1 + m) * 255) };
}

/**
 * Parses a color given as `#hex` (3/4/6/8-digit), a `{r,g,b,a}` object, or a
 * CSS `rgb()`/`rgba()` string.
 * @param {string|{r:number,g:number,b:number,a?:number}} input
 * @returns {{r:number,g:number,b:number,a:number}|null}
 */
export function parseColor(input) {
    if (input == null) return null;

    if (typeof input === 'object') {
        const { r, g, b, a = 1 } = input;
        if ([r, g, b].some(n => typeof n !== 'number' || Number.isNaN(n))) return null;
        return { r: clampByte(r), g: clampByte(g), b: clampByte(b), a: clampAlpha(a) };
    }

    if (typeof input !== 'string') return null;
    const s = input.trim();

    if (s.startsWith('#')) return hexToRgb(s);

    const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (m) {
        return {
            r: clampByte(parseFloat(m[1])),
            g: clampByte(parseFloat(m[2])),
            b: clampByte(parseFloat(m[3])),
            a: clampAlpha(m[4] !== undefined ? parseFloat(m[4]) : 1)
        };
    }

    return null;
}

/**
 * @param {string|{r:number,g:number,b:number,a?:number}} input
 * @returns {{r:number,g:number,b:number,a:number,hex:string}} Falls back to
 * opaque black if `input` can't be parsed, so callers always get a usable color.
 */
export function normalizeColor(input) {
    const rgb = parseColor(input) || { r: 0, g: 0, b: 0, a: 1 };
    return { ...rgb, hex: rgbToHex(rgb) };
}

/**
 * @param {{r:number,g:number,b:number,a?:number}} color
 * @returns {string} CSS `rgba(r, g, b, a)` string.
 */
export function rgbaString({ r, g, b, a = 1 }) {
    return `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${clampAlpha(a)})`;
}

/**
 * @param {{r:number,g:number,b:number,a?:number}} color
 * @returns {string} `#rrggbb` when alpha is 1, otherwise the CSS `rgba()` string
 * (kept distinct from `rgbToHex`'s 8-digit hex output since not every CSS
 * consumer accepts `#rrggbbaa`).
 */
export function serializeColor(color) {
    const c = { ...color, a: color.a ?? 1 };
    return clampAlpha(c.a) === 1 ? rgbToHex(c) : rgbaString(c);
}

const D65 = { x: 0.95047, y: 1, z: 1.08883 };

function srgbToLinear(c) {
    const n = c / 255;
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

function linearToSrgb(n) {
    const c = n <= 0.0031308 ? n * 12.92 : 1.055 * Math.pow(n, 1 / 2.4) - 0.055;
    return clampByte(c * 255);
}

function labF(t) {
    const d = 6 / 29;
    return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}

function labFInv(t) {
    const d = 6 / 29;
    return t > d ? t * t * t : 3 * d * d * (t - 4 / 29);
}

/**
 * @param {{r:number,g:number,b:number}} rgb - 0-255 each.
 * @returns {{l:number,a:number,b:number}} l in 0-100, a/b roughly -128..127.
 */
export function rgbToLab({ r, g, b }) {
    const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);

    const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
    const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
    const z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;

    const fx = labF(x / D65.x), fy = labF(y / D65.y), fz = labF(z / D65.z);

    return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/**
 * @param {{l:number,a:number,b:number}} lab
 * @returns {{r:number,g:number,b:number}} 0-255 each, gamut-clamped.
 */
export function labToRgb({ l, a, b }) {
    const fy = (l + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;

    const x = D65.x * labFInv(fx);
    const y = D65.y * labFInv(fy);
    const z = D65.z * labFInv(fz);

    const rl =  x * 3.2404542 - y * 1.5371385 - z * 0.4985314;
    const gl = -x * 0.9692660 + y * 1.8760108 + z * 0.0415560;
    const bl =  x * 0.0556434 - y * 0.2040259 + z * 1.0572252;

    return { r: linearToSrgb(rl), g: linearToSrgb(gl), b: linearToSrgb(bl) };
}

/**
 * @param {{r:number,g:number,b:number}} rgb - 0-255 each.
 * @returns {{c:number,m:number,y:number,k:number}} 0-100 each.
 */
export function rgbToCmyk({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const k = 1 - Math.max(rn, gn, bn);
    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
    return {
        c: ((1 - rn - k) / (1 - k)) * 100,
        m: ((1 - gn - k) / (1 - k)) * 100,
        y: ((1 - bn - k) / (1 - k)) * 100,
        k: k * 100
    };
}

/**
 * @param {{c:number,m:number,y:number,k:number}} cmyk - 0-100 each.
 * @returns {{r:number,g:number,b:number}} 0-255 each.
 */
export function cmykToRgb({ c, m, y, k }) {
    const cn = clamp(c, 0, 100) / 100, mn = clamp(m, 0, 100) / 100;
    const yn = clamp(y, 0, 100) / 100, kn = clamp(k, 0, 100) / 100;
    return {
        r: clampByte((1 - cn) * (1 - kn) * 255),
        g: clampByte((1 - mn) * (1 - kn) * 255),
        b: clampByte((1 - yn) * (1 - kn) * 255)
    };
}

/**
 * Rounds each channel to the nearest multiple of 51 — the 216-color
 * "web-safe" palette.
 * @param {{r:number,g:number,b:number}} rgb
 * @returns {{r:number,g:number,b:number}}
 */
export function nearestWebSafeRgb({ r, g, b }) {
    const snap = n => clampByte(Math.round(n / 51) * 51);
    return { r: snap(r), g: snap(g), b: snap(b) };
}
