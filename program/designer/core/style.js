/**
 * @file designer/core/style.js
 * @description Shared helper for turning a Node's `layout`/`style` into an
 * inline CSS string. Used by every block renderer so layout handling
 * (absolute/flow/flex) stays consistent across block types instead of each
 * one reimplementing it. Text escaping uses the OS-wide `app.util.escapeHtml`
 * (`sandstorm/components/util.js`) directly at each call site — this module
 * used to export its own separate `escapeHTML`, identical in behavior but a
 * needless second implementation.
 *
 * Also exports `init(app)` — sets up `app.designer.style.setColor(node,
 * property, color)`, the color system's write path into a node's own
 * `style` object (e.g. `style.color`/`style.backgroundColor`). No parsing
 * changes were needed in `buildStyle()` itself: it already turns any
 * `node.style` key into kebab-case CSS generically, so a color value just
 * needs to land in `node.style[property]` like any other style property —
 * `setColor` only adds the semantic undo/redo wrapping via `win.history`
 * (the exact `session.execute({type, title, do, undo, redo})` command
 * pattern `tools/text.js` already uses for its own node mutations) plus a
 * canvas re-render. `init(app)` coexists with this file's direct-import
 * usage by every `blocks/*.js` renderer — `buildStyle` stays a plain named
 * export; only `init` is additionally loaded via `app.includeModule` like
 * the other `app.designer.*` singletons.
 *
 * @module program/designer/core/style
 */

import { normalizeColor, serializeColor } from './color.js';
import { keyframeName } from './animation.js';
import { resolveComputedStyle } from './stylesheet.js';

function px(value) {
    return typeof value === 'number' ? `${value}px` : value;
}

/**
 * @param {import('./document.js').Node} node
 * @returns {string} A `;`-joined inline-style string.
 */
export function buildStyle(node) {
    const l = node.layout || {};
    const s = resolveComputedStyle(node);
    const parts = [];

    parts.push(`position:${l.mode === 'absolute' ? 'absolute' : 'relative'}`);
    if (l.mode === 'absolute') {
        if (l.x != null) parts.push(`left:${px(l.x)}`);
        if (l.y != null) parts.push(`top:${px(l.y)}`);
    }
    if (l.width != null) parts.push(`width:${px(l.width)}`);
    if (l.height != null) parts.push(`height:${px(l.height)}`);

    if (l.mode === 'flex') {
        parts.push('display:flex');
        parts.push(`flex-direction:${l.direction === 'column' ? 'column' : 'row'}`);
        if (l.gap != null) parts.push(`gap:${px(l.gap)}`);
    } else if (l.mode === 'grid') {
        parts.push('display:grid');
        if (l.columns != null) parts.push(`grid-template-columns:${l.columns}`);
        if (l.gap != null) parts.push(`gap:${px(l.gap)}`);
    }

    Object.entries(s).forEach(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        parts.push(`${cssKey}:${value}`);
    });

    const anim = node.props?.animation;
    if (anim?.keyframes?.length) {
        const iterationCount = anim.iterationCount === 'infinite' ? 'infinite' : (anim.iterationCount ?? 1);
        parts.push(`animation:${keyframeName(node.id)} ${anim.duration ?? 1}s ${anim.timingFunction || 'ease'} ${anim.delay ?? 0}s ${iterationCount} ${anim.direction || 'normal'} ${anim.fillMode || 'none'}`);
    }

    return parts.join(';');
}

/**
 * @param {import('./document.js').Node} node
 * @param {string} property - A `node.style` key, e.g. `'color'`/`'backgroundColor'`.
 * @param {string|{r,g,b,a}} color
 */
function setColor(node, property, color) {
    const before = node.style?.[property];
    const after  = serializeColor(normalizeColor(color));

    const apply = (value) => {
        node.style = node.style || {};
        if (value === undefined) delete node.style[property]; else node.style[property] = value;
        app.designer.render();
    };

    const session = app.designer.win?.history;
    if (session) {
        session.execute({
            type: 'style.color',
            title: _('Changed color'),
            do()   { apply(after); },
            undo() { apply(before); },
            redo() { apply(after); }
        });
    } else {
        apply(after);
    }
}

/**
 * Generic sibling to `setColor` for non-color style values (font family/
 * size/weight/style, text-align, writing-mode, font-smoothing, ...) — same
 * `win.history.execute()` command pattern, just without color parsing.
 * @param {import('./document.js').Node} node
 * @param {string} property - A `node.style` key.
 * @param {string|number|undefined} value - `undefined` removes the property.
 * @param {string} [title] - History panel label; defaults to a generic
 *   "Changed <property>" when the call site doesn't have a nicer one.
 */
function setProperty(node, property, value, title) {
    const before = node.style?.[property];

    const apply = (v) => {
        node.style = node.style || {};
        if (v === undefined) delete node.style[property]; else node.style[property] = v;
        app.designer.render();
    };

    const session = app.designer.win?.history;
    if (session) {
        session.execute({
            type: 'style.property',
            title: title || (_('Changed') + ' ' + property),
            do()   { apply(value); },
            undo() { apply(before); },
            redo() { apply(value); }
        });
    } else {
        apply(value);
    }
}

/**
 * Same `win.history.execute()` shape as `setProperty`, for when a single
 * user action changes more than one `node.style` key at once (e.g. all four
 * `border{Side}Width` props together, or a Solid/Gradient mode switch that
 * touches `borderStyle`+`borderColor`+`borderImage` in one go) — one history
 * entry for the whole map, not one per key. Purely generic: no CSS-specific
 * logic, no value normalization, doesn't mutate the caller's `propsMap`.
 * @param {import('./document.js').Node} node
 * @param {Object<string, string|number|undefined>} propsMap - `undefined` removes that property.
 * @param {string} [title] - History panel label.
 */
function setProperties(node, propsMap, title) {
    const props = Object.keys(propsMap);
    const before = Object.fromEntries(props.map(p => [p, node.style?.[p]]));
    const after  = { ...propsMap };

    const apply = (vals) => {
        node.style = node.style || {};
        props.forEach(p => {
            if (vals[p] === undefined) delete node.style[p]; else node.style[p] = vals[p];
        });
        app.designer.render();
    };

    const session = app.designer.win?.history;
    if (session) {
        session.execute({
            type: 'style.combined',
            title: title || _('Changed style'),
            do()   { apply(after); },
            undo() { apply(before); },
            redo() { apply(after); }
        });
    } else {
        apply(after);
    }
}

export function init(app) {
    app.designer = app.designer || {};
    app.designer.style = { setColor, setProperty, setProperties };
}
