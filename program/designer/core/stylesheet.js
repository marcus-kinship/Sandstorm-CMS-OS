/**
 * @file designer/core/stylesheet.js
 * @description Style Binding foundation — Step 1 of a planned multi-step
 * rework (per direct feedback): today every node only has inline `node.
 * style`; this introduces a second, class/id-addressable style source
 * without touching that one. Deliberately data-model-and-renderer only —
 * no UI reads or writes any of this yet (that's later steps: Class/ID UI,
 * DOM-tree source badges, a Quick/Groups/CSS properties panel, `:hover`
 * etc., responsive breakpoints, "Move to class"). Every function here is
 * already the plain write API a future UI would call directly, same
 * `win.history.execute()` shape every other Designer mutation already uses
 * (core/style.js's own `setColor`/`setProperty`) — so those later steps are
 * additive UI work, not another data-model rewrite.
 *
 * `Document#stylesheet` (core/document.js) is `{ rules: [{selector, style}] }`
 * — selectors are exactly `.classname` or `#id`, nothing else yet (no
 * combinators, no pseudo-classes, no media queries — see the file list
 * above for the intended growth order). A node opts into a rule via
 * `node.props.classes` (array, matched in order) and/or `node.props.id`,
 * both plain `props` entries so they already round-trip through `Node#
 * toJSON()` like any other custom field (core/document.js's `KNOWN_KEYS`
 * fold-in) — no Node change was needed for this step.
 *
 * `resolveStyleSources(node)` is the **single cascade algorithm** — the only
 * place merge-order logic exists (classes in array order, then id, then
 * inline — ascending specificity, same order real CSS uses, with inline
 * always winning; see the locked invariants below). It returns one entry
 * per resolved property: `{ property, value, source, selector, state,
 * breakpoint }`, `source` always one of just `'class' | 'id' | 'inline'` —
 * `state` (Step 7) and `breakpoint` (Step 8) are fields *alongside*
 * `source`, not additional source values, since a state/breakpoint rule is
 * still fundamentally a class or id rule (see below); `source` itself never
 * grows further. `state` is `null` for a normal-state value, or
 * `'hover' | 'active' | 'focus' | 'disabled'` when the winning value came
 * from a state-scoped rule. No UI reads any of this yet; it exists now so a future
 * Properties-panel source badge and a future DOM-tree symbol both read the
 * *same* resolved data a later step will just start consuming, rather than
 * needing their own second traversal invented from scratch.
 *
 * **States (Step 7).** A stylesheet rule may carry an optional `state` field
 * (`{selector, state: 'hover', style}`) — `Document#stylesheet.rules` can now
 * hold both a class/id's normal rule and its state-scoped variants as
 * *separate* rule entries sharing the same `selector`, distinguished by
 * `state`. `setActivePreviewState(state)` is a persistent toggle (unlike
 * `setActiveStylesheet`, not reset per render pass — it's a designer-wide
 * "preview this state" mode, on until explicitly turned off or changed,
 * same idea as Photoshop previewing a layer comp) that `resolveStyleSources`
 * reads to decide whether state-scoped rules apply at all. When a state is
 * active, each tier (class, then id) applies its *own* state-scoped rule
 * strictly after that tier's normal rule — so a state override always beats
 * its own tier's base value, but a class's hover rule still never beats a
 * plain id rule, matching real CSS specificity (id always outranks class,
 * hover or not). This is a deliberately simpler contract than real CSS
 * specificity math in exchange for staying easy to reason about — same
 * trade-off Step 2 already made for `classes[]`'s own array-order-as-
 * cascade-order contract, not an attempt to reproduce the whole spec.
 *
 * **Responsive (Step 8)** proves the exact pattern Step 7's own header
 * comment predicted: a rule may also carry an optional `breakpoint` field
 * (`'tablet' | 'mobile'`, absent = desktop/base — same "null means normal"
 * shape `state` already used), and `setActiveBreakpoint(breakpoint)` is a
 * second **persistent** toggle alongside `setActivePreviewState`, read the
 * same way inside `resolveStyleSources()`. Deliberately **independent** of
 * `designer_devicemode.js`'s own canvas-width preview dropdown (18 pixel
 * presets for visual preview only, no connection to the cascade at all) —
 * auto-deriving "which of 3 breakpoints is active" from one of 18 arbitrary
 * pixel widths is a real product decision (exact thresholds) nobody has
 * made yet, so this stays a separate, explicit toggle rather than guessing
 * a wiring that might be wrong. Per tier, the priority order is now
 * base → state variant → breakpoint variant (breakpoint applies last,
 * winning any tie against an also-active state for the same property —
 * an arbitrary but documented choice for the rare case both are active at
 * once) — id still always fully outranks class regardless of state/
 * breakpoint, unchanged from Step 7.
 *
 * `resolveComputedStyle(node)` — what core/style.js's `buildStyle()` calls —
 * is a **thin flattening view over `resolveStyleSources()`**, not a second
 * merge implementation. This is a locked invariant, not an incidental
 * detail: two independent copies of "who wins" is exactly how these systems
 * quietly drift out of sync once state/responsive get added.
 *
 * Both read whichever stylesheet `setActiveStylesheet()` was last given
 * rather than taking one as a parameter — canvas/renderer.js's own
 * `render(doc, containerEl)` calls it once, synchronously, right before
 * walking the tree (`renderNode` recurses through every block's own
 * `render(node, childHTMLs)`, none of which know a Document exists at all,
 * nor should they — the renderer never needs to know inline/class/id even
 * exist, it just gets a flat style map), so threading a stylesheet argument
 * through eight separate block files' `render()` signatures would touch far
 * more of the codebase for the same result. Safe because JS is
 * single-threaded and the whole walk is synchronous — there's no async gap
 * between setting it and every `buildStyle()` call that reads it during
 * that same render pass.
 *
 * Locked invariants (do not violate without a deliberate architecture
 * decision, same as the ones above):
 *  - `resolveStyleSources()` is the cascade's source of truth.
 *  - `resolveComputedStyle()` implements no merge logic of its own.
 *  - `buildStyle()` still only ever sees a plain flat style map.
 *  - The renderer (canvas/renderer.js, every blocks/*.js) never needs to
 *    know inline/class/id exist.
 *  - No UI implements cascade logic — it only ever reads resolved output.
 *  - `source` never grows past `'class'|'id'|'inline'` — state (Step 7) and
 *    breakpoint (Step 8) are fields alongside it, not new source values.
 *  - No `!important` in this model.
 *
 * @module program/designer/core/stylesheet
 */

let activeStylesheet = null;
let activePreviewState = null; // null | 'hover' | 'active' | 'focus' | 'disabled'
let activeBreakpoint = null; // null (desktop/base) | 'tablet' | 'mobile'

/** Called once per render pass (canvas/renderer.js) before walking the tree. */
export function setActiveStylesheet(stylesheet) {
    activeStylesheet = stylesheet || null;
}

/** Persistent designer-wide toggle (see this file's own header comment) — not reset per render pass. */
export function setActivePreviewState(state) {
    activePreviewState = state || null;
}

export function getActivePreviewState() {
    return activePreviewState;
}

/** Persistent designer-wide toggle, independent of setActivePreviewState — see this file's own Step 8 header comment. */
export function setActiveBreakpoint(breakpoint) {
    activeBreakpoint = breakpoint || null;
}

export function getActiveBreakpoint() {
    return activeBreakpoint;
}

function findActiveRule(selector, state, breakpoint) {
    const st = state || null;
    const bp = breakpoint || null;
    return activeStylesheet?.rules?.find(r => r.selector === selector && (r.state || null) === st && (r.breakpoint || null) === bp) || null;
}

/**
 * The cascade — see this file's own header comment for the locked
 * invariants and the Step 7/8 states+responsive contract. One `Map` keyed
 * by property name: each source is applied in ascending-priority order and
 * simply overwrites whatever entry (if any) the same property already had,
 * so the final value for a property is always whichever source applied it
 * *last* — no explicit priority comparison needed, the call order below
 * *is* the priority order: class (normal, then its own active-state
 * variant, then its own active-breakpoint variant) → id (same three) →
 * inline. A state/breakpoint variant is only ever consulted when
 * `setActivePreviewState()`/`setActiveBreakpoint()` has one active; with
 * neither active this produces byte-identical output to before Step 7.
 *
 * @param {import('./document.js').Node} node
 * @returns {Array<{property: string, value: *, source: 'class'|'id'|'inline', selector: string|null, state: string|null, breakpoint: string|null}>}
 */
export function resolveStyleSources(node) {
    const resolved = new Map(); // property -> {property, value, source, selector, state, breakpoint}

    function apply(style, source, selector, state, breakpoint) {
        Object.entries(style || {}).forEach(([property, value]) => {
            resolved.set(property, { property, value, source, selector, state: state || null, breakpoint: breakpoint || null });
        });
    }

    function applyTier(selector, source) {
        const rule = findActiveRule(selector, null, null);
        if (rule) apply(rule.style, source, selector, null, null);
        if (activePreviewState) {
            const stateRule = findActiveRule(selector, activePreviewState, null);
            if (stateRule) apply(stateRule.style, source, selector, activePreviewState, null);
        }
        if (activeBreakpoint) {
            const bpRule = findActiveRule(selector, null, activeBreakpoint);
            if (bpRule) apply(bpRule.style, source, selector, null, activeBreakpoint);
        }
    }

    (node.props?.classes || []).forEach(cls => applyTier(`.${cls}`, 'class'));

    if (node.props?.id) applyTier(`#${node.props.id}`, 'id');

    apply(node.style, 'inline', null, null, null);

    return [...resolved.values()];
}

/** @param {import('./document.js').Node} node @returns {Object} Flat {property: value} map, ready for buildStyle()'s own kebab-casing loop — see this file's own header comment on why this holds no merge logic of its own. */
export function resolveComputedStyle(node) {
    const style = {};
    resolveStyleSources(node).forEach(({ property, value }) => { style[property] = value; });
    return style;
}

function findRuleIndex(stylesheet, selector, state, breakpoint) {
    const st = state || null;
    const bp = breakpoint || null;
    return stylesheet.rules.findIndex(r => r.selector === selector && (r.state || null) === st && (r.breakpoint || null) === bp);
}

/** @returns {{selector: string, state?: string, breakpoint?: string, style: Object}|null} */
export function getRule(stylesheet, selector, state, breakpoint) {
    const idx = findRuleIndex(stylesheet, selector, state, breakpoint);
    return idx === -1 ? null : stylesheet.rules[idx];
}

// Shared by setRule/removeRule — `afterRule` null means "delete the rule
// entirely" (removeRule's own case); a non-null rule replaces or inserts.
function commitRule(stylesheet, selector, state, breakpoint, afterRule, title) {
    const before = getRule(stylesheet, selector, state, breakpoint);
    const beforeRule = before ? { ...before, style: { ...before.style } } : null;

    const apply = (rule) => {
        const idx = findRuleIndex(stylesheet, selector, state, breakpoint);
        if (rule === null) {
            if (idx !== -1) stylesheet.rules.splice(idx, 1);
        } else if (idx === -1) {
            stylesheet.rules.push(rule);
        } else {
            stylesheet.rules[idx] = rule;
        }
        app.designer.render();
    };

    const session = app.designer.win?.history;
    if (session) {
        session.execute({ type: 'stylesheet.rule', title, do: () => apply(afterRule), undo: () => apply(beforeRule), redo: () => apply(afterRule) });
    } else {
        apply(afterRule);
    }
}

/** Replaces (or creates) the rule for `selector`+`state`+`breakpoint` with exactly `style` — not a partial merge; callers pass the rule's full intended style object. */
export function setRule(stylesheet, selector, style, title, state, breakpoint) {
    const rule = { selector, ...(state ? { state } : {}), ...(breakpoint ? { breakpoint } : {}), style: { ...style } };
    commitRule(stylesheet, selector, state, breakpoint, rule, title || (_('Changed') + ' ' + selector));
}

export function removeRule(stylesheet, selector, title, state, breakpoint) {
    if (!getRule(stylesheet, selector, state, breakpoint)) return;
    commitRule(stylesheet, selector, state, breakpoint, null, title || (_('Removed') + ' ' + selector));
}

function setNodeProp(node, key, value, title) {
    const before = node.props?.[key];
    const apply = (v) => {
        node.props = node.props || {};
        if (v === undefined) delete node.props[key]; else node.props[key] = v;
        app.designer.render();
    };
    const session = app.designer.win?.history;
    if (session) {
        session.execute({ type: `node.${key}`, title, do: () => apply(value), undo: () => apply(before), redo: () => apply(value) });
    } else {
        apply(value);
    }
}

/** @param {string[]} classes */
export function setClasses(node, classes, title) {
    const value = Array.isArray(classes) && classes.length ? [...classes] : undefined;
    setNodeProp(node, 'classes', value, title || _('Changed classes'));
}

export function setId(node, id, title) {
    setNodeProp(node, 'id', id || undefined, title || _('Changed id'));
}

export function init(app) {
    app.designer = app.designer || {};
    app.designer.stylesheet = {
        getRule, setRule, removeRule, setClasses, setId, resolveStyleSources, resolveComputedStyle,
        setActivePreviewState, getActivePreviewState, setActiveBreakpoint, getActiveBreakpoint
    };
}
