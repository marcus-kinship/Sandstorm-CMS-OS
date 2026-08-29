/**
 * @file designer/blocks/text.js
 * @description "text" block — `node.props.value` rendered as escaped text.
 * `node.props.tag` picks the wrapper element (p/span/h1-h6); defaults to a
 * plain div. Kept to a fixed allowlist rather than trusting the value
 * directly into the tag name.
 *
 * `node.props.textMode` (`'normal'` default | `'wave'` | `'vertical'`, set
 * by the Text Tool's own submenu — program/designer/tools/text.js) picks
 * one of three render branches. Old nodes/documents predating this field
 * have no `textMode` at all — every read falls back to `'normal'`, so
 * nothing needs a migration step.
 *
 * @module program/designer/blocks/text
 */

import { registerBlock } from '../core/registry.js';
import { buildStyle } from '../core/style.js';

const ALLOWED_TAGS = new Set(['div', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'code']);

const WAVE_AMPLITUDE = 8;   // px
const WAVE_FREQUENCY = 0.5; // radians per character

/**
 * Static (non-animated) per-character wave shape. Splits the *raw* value
 * into characters first, escaping each individually after — never
 * `app.util.escapeHtml(value).split('')`, which would split a
 * multi-character HTML entity (e.g. `&amp;`) apart as if its characters
 * were original text.
 * Purely a render-time transform: `node.props.value` itself is never
 * rewritten to contain markup, so editing (tools/text.js's plain-string
 * before/after diffing) is unaffected.
 * @param {string} value
 * @returns {string}
 */
function waveSpansHTML(value) {
    return [...String(value ?? '')].map((char, i) => {
        const offset = (WAVE_AMPLITUDE * Math.sin(i * WAVE_FREQUENCY)).toFixed(2);
        const content = char === ' ' ? '&nbsp;' : app.util.escapeHtml(char);
        return `<span style="display:inline-block;transform:translateY(${offset}px)">${content}</span>`;
    }).join('');
}

registerBlock('text', {
    defaults: { props: { value: 'Text', tag: 'div', textMode: 'normal' }, layout: { mode: 'flow' } },
    render(node) {
        const tag = ALLOWED_TAGS.has(node.props?.tag) ? node.props.tag : 'div';
        const textMode = node.props?.textMode || 'normal';

        let styleStr = `${buildStyle(node)};display:flex;align-items:flex-start;justify-content:flex-start`;
        if (textMode === 'vertical') styleStr += ';writing-mode:vertical-rl';

        const inner = textMode === 'wave' ? waveSpansHTML(node.props?.value) : app.util.escapeHtml(node.props?.value);

        return `<${tag} class="db-node db-text" data-node-id="${node.id}" style="${styleStr}">${inner}</${tag}>`;
    }
});
