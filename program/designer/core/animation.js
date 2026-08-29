/**
 * @file designer/core/animation.js
 * @description Builds and injects the shared `<style>` tag holding every
 * node's custom `@keyframes` rule, generated from `node.props.animation.
 * keyframes` (each entry `{ offset, props }`, `offset` 0-100 and `props` a
 * plain CSS-property-name -> value map, same shape `node.style` already
 * uses). Lives under `props`, not a bare `node.animation` field — `Node`
 * (core/document.js) only ever serializes its fixed known keys plus `props`
 * (`toJSON()`/the constructor's `KNOWN_KEYS` fold-in), so anything outside
 * that set would silently vanish on Save/reload.
 *
 * Regenerates the whole stylesheet from the entire document tree on every
 * canvas render rather than diffing incrementally — Designer documents are
 * small, and canvas/renderer.js's own full-tree re-render on every change
 * already makes the same trade-off.
 *
 * `keyframeName()` is a plain function (no `app` dependency) — imported
 * directly by core/style.js's `buildStyle()` so a node's own `animation`
 * shorthand always points at the exact same generated name this file emits,
 * regardless of module init order.
 *
 * @module program/designer/core/animation
 */

export function keyframeName(nodeId) {
    return `db-anim-${nodeId}`;
}

function cssProp(key) {
    return key.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function stepCSS(step) {
    const decls = Object.entries(step.props || {})
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${cssProp(k)}:${v}`)
        .join(';');
    return `${step.offset}% { ${decls} }`;
}

/** @param {import('./document.js').Document} doc */
export function buildKeyframesCSS(doc) {
    if (!doc?.root) return '';
    const rules = [];
    doc.root.walk(node => {
        const anim = node.props?.animation;
        if (!anim?.keyframes?.length) return;
        const steps = [...anim.keyframes].sort((a, b) => a.offset - b.offset).map(stepCSS).join(' ');
        rules.push(`@keyframes ${keyframeName(node.id)} { ${steps} }`);
    });
    return rules.join('\n');
}

let styleEl = null;
function updateStylesheet() {
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'designer-animations-style';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = buildKeyframesCSS(app.designer.getDocument?.());
}

export function init(app) {
    updateStylesheet();
    app.designer._registerRenderHook(updateStylesheet);
}
