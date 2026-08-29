/**
 * @file designer/designer_boxmodel_panel.js
 * @description Owns the "Properties" dock panel (`#designerProperties`'s
 * `[data-dock-id="properties"]`) — a DevTools-style nested box-model diagram
 * (margin -> border -> padding -> content) for the currently selected node,
 * a read-only number on each edge plus the content box's rendered size.
 *
 * Holds four tabs in its own title bar (2026-08-25, per direct feedback) —
 * same mechanism `designer_layers_panel.js`'s Layers/Elements pair and
 * `designer_groups_panel.js`'s six Groups tabs both use (overwriting
 * designer_dock.js's plain `.dock-title` text directly): the diagram itself
 * (labeled **"Box view"**, not "Properties" — renamed per direct feedback
 * since it's literally a diagram, not an editable properties list), then
 * "Color" (`designer_color_history.js`'s
 * color map, FG/BG slot pair, and recent/favorite swatches all folded into
 * one tab — see that file's own header comment) and "Gradients"/"Patterns"
 * (`designer_gradients_panel.js`/`designer_patterns_panel.js`, lazy-loaded
 * on first visit — see `renderLazyTab` below). Two earlier passes got this
 * wrong before landing here: first Color/Swatches/Gradients/Patterns were
 * grouped under one outer "Colors" tab with its own nested content-area
 * sub-tab row (corrected — "ska inte vara sub-tabs ... men tabbar som
 * layers elements" — into a flat five-tab title bar with Swatches as its
 * own fifth tab); then Swatches itself was folded into Color per direct
 * feedback, dropping the title bar to four tabs — there is no second tab
 * level anywhere in this panel now, and no separate Swatches tab either.
 * This file owns the tab-switching and dispatches to each tab's own owner;
 * it holds no color/gradient/pattern data or view logic itself. Four tabs
 * still don't reliably fit an ~280px title bar, so (like Groups' six) the
 * title bar scrolls horizontally with a hidden scrollbar instead of wrapping.
 *
 * Read-only by design (2026-08-24, per direct feedback): this panel used to
 * also own the editable Margin/Border/Padding/Width/Height fields (a
 * row-per-section field group underneath the diagram) and an "Edit
 * border…" button, but those are exactly the same fields
 * designer_groups_panel.js's Box/Border tabs now expose — once that
 * "Groups" panel existed, keeping a second live editing surface for the
 * same properties was pure duplication rather than useful overlap (unlike
 * e.g. Fill/Line staying in the Cursor bar as a deliberate quick-access
 * shortcut). The diagram itself has no equivalent elsewhere though (Groups
 * has no visual box-model view), so it stays — this panel is now purely
 * that visual, driven by whatever the *resolved* cascade/`node.layout`
 * currently is, with hover-to-highlight-on-canvas per ring still intact.
 *
 * `designer.js`'s own `start()` registers a placeholder for `id: 'properties'`
 * before this file loads (see its dockReady chain) — `app.designer.dock.add()`
 * below overwrites it in place, same as History/Layers' own placeholders.
 *
 * The diagram's numbers still read the *resolved* cascade (Step 4 of the
 * Style Binding rework, core/stylesheet.js's `resolveStyleSources`), not
 * raw `node.style` — a value coming from a class/id rule shows the true
 * computed box model here, same as it always did on the actual rendered
 * canvas element.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`,
 * alongside designer_layers_panel.js/designer_history_log.js/
 * designer_toolbar.js — needs both the dock (`app.designer.dock`) and the
 * object model (`getDocument()`, `app.designer.selection`,
 * `app.designer._registerRenderHook`) ready first.
 *
 * @module program/designer/designer_boxmodel_panel
 */

const SIDES = ['Top', 'Right', 'Bottom', 'Left'];

const PROP_OF = {
    margin:  s => `margin${s}`,
    border:  s => `border${s}Width`,
    padding: s => `padding${s}`
};

const SECTION_COLOR = { margin: '#3d2f1f', border: '#3d3a1f', padding: '#1f3340', content: '#4da3ff' };

function selectedNode() {
    const doc = app.designer.getDocument?.();
    const id = app.designer.selection?.get?.();
    return id ? doc?.find(id) : null;
}

let resolvedSources = new Map(); // property -> {property, value, source, selector}

function refreshResolvedSources(node) {
    resolvedSources = new Map();
    if (!node) return;
    (app.designer.stylesheet?.resolveStyleSources?.(node) || []).forEach(s => resolvedSources.set(s.property, s));
}

// Now reads the *resolved* cascade (class/id/inline), not just node.style
// directly — a value set via a class rule now shows up here too, same as it
// already did on the actual rendered canvas element (core/style.js's
// buildStyle()). Falls back to node.style directly only if the stylesheet
// module hasn't loaded yet (shouldn't happen in practice — see designer.js's
// own load-order comment on core/stylesheet.js).
function fieldValue(node, prop) {
    const src = resolvedSources.get(prop);
    const raw = src ? src.value : node.style?.[prop];
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : '';
}

function formatDim(v) {
    if (v === undefined || v === null || v === '') return _('auto');
    return typeof v === 'number' ? `${v}px` : String(v);
}

// node.layout.width/height is undefined for most nodes — real content, and
// every splitter pane (whose actual size comes from props.flexBasis/
// props.height instead, never layout.width/height — see tools/resize.js's
// own file header), so this panel showed a bare "auto" for practically
// every selectable block, live-dragged or not, rather than anything useful.
// Falls back to the canvas element's own current rendered size instead of
// the layout-only placeholder — still just a display default: editing/
// committing this field always writes layout.width/height explicitly, same
// as before, this only changes what shows before that first edit.
function renderedDim(node, dim) {
    try {
        const el = canvasElementOf(node);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return Math.round(dim === 'width' ? rect.width : rect.height);
    } catch (error) {
        console.error('renderedDim failed:', error);
        return null;
    }
}

// Read-only diagram text — no commit path of its own, so it can just show
// the rendered fallback directly as the displayed number.
function formatDimOrRendered(node, dim) {
    const v = node.layout?.[dim];
    if (v !== undefined && v !== null && v !== '') return formatDim(v);
    const rendered = renderedDim(node, dim);
    return rendered != null ? `${rendered}px` : _('auto');
}

// Plain read-only numbers overlaid on the diagram's edges — editing lives in
// designer_groups_panel.js's Box/Border tabs now, not here (see this file's
// own header comment).
function diagramNumbersHTML(node, propOf) {
    return SIDES.map(side => {
        const v = fieldValue(node, propOf(side));
        return `<span class="dbm-num dbm-num-${side.toLowerCase()}">${v === '' ? 0 : v}</span>`;
    }).join('');
}

function panelHTML(node) {
    if (!node) {
        return `<p class="designer-boxmodel-empty">${_('Select an element to edit its box model')}</p>`;
    }

    return (
        `<div class="designer-boxmodel">` +
            `<div class="dbm-box dbm-margin">` +
                `<span class="dbm-label">${_('margin')}</span>` +
                diagramNumbersHTML(node, PROP_OF.margin) +
                `<div class="dbm-box dbm-border dbm-inner">` +
                    `<span class="dbm-label">${_('border')}</span>` +
                    diagramNumbersHTML(node, PROP_OF.border) +
                    `<div class="dbm-box dbm-padding dbm-inner">` +
                        `<span class="dbm-label">${_('padding')}</span>` +
                        diagramNumbersHTML(node, PROP_OF.padding) +
                        `<div class="dbm-content dbm-inner">` +
                            `<span class="dbm-content-size">${formatDimOrRendered(node, 'width')} &times; ${formatDimOrRendered(node, 'height')}</span>` +
                        `</div>` +
                    `</div>` +
                `</div>` +
            `</div>` +
        `</div>`
    );
}

function canvasElementOf(node) {
    return document.querySelector(`#designerCanvasBody [data-node-id="${node.id}"]`);
}

// Live readout during a tools/resize.js drag (dragging a splitter seam or a
// plain node's own bottom edge) — mirrors the element's current actual
// pixel size into the diagram's content-size text, for as long as the panel
// happens to be showing that same node. Pure display, doesn't touch
// node.layout at all. The dimension *not* being dragged is read straight
// off the element's own current rendered size (same fallback
// renderedDim/formatDimOrRendered already use for the non-live display) —
// this used to also mirror into now-removed Width/Height input fields;
// those live in designer_groups_panel.js's Box tab now, so there's nothing
// left here to sync but the diagram text itself.
function previewLiveDimension(nodeId, dim, px) {
    const node = selectedNode();
    if (!node || node.id !== nodeId) return;
    const panel = document.querySelector('[data-dock-id="properties"] .designer-dock-content');
    const sizeEl = panel?.querySelector('.dbm-content-size');
    if (!sizeEl) return;

    const rect = canvasElementOf(node)?.getBoundingClientRect();
    const w = dim === 'width' ? Math.round(px) : Math.round(rect?.width ?? 0);
    const h = dim === 'height' ? Math.round(px) : Math.round(rect?.height ?? 0);
    sizeEl.textContent = `${w}px × ${h}px`;
}

function highlightElement(node, color) {
    const el = canvasElementOf(node);
    if (!el) return;
    el.style.outline = `3px solid ${color}`;
    el.style.outlineOffset = '0px';
}

function clearHighlight(node) {
    const el = canvasElementOf(node);
    if (!el) return;
    el.style.outline = '';
    el.style.outlineOffset = '';
}

function sectionKeyOf(el) {
    if (el.classList.contains('dbm-margin')) return 'margin';
    if (el.classList.contains('dbm-border')) return 'border';
    if (el.classList.contains('dbm-padding')) return 'padding';
    if (el.classList.contains('dbm-content')) return 'content';
    return null;
}

// Hovering a ring of the diagram highlights that same region's color on the
// actual node on the canvas — margin/border/padding are nested `.dbm-box`
// elements whose child fills only their center grid cell, so each ring's own
// edge gutters are genuinely uncovered DOM space; a bubbling 'mouseover' +
// closest() on the whole diagram picks out whichever single ring is directly
// under the cursor (no separate per-box mouseenter/mouseleave bookkeeping
// needed — those don't fire again when moving between nested rings, which
// would leave a stale outer highlight on). A single 'mouseleave' on the
// diagram root (non-bubbling, fires once when the pointer truly exits it)
// clears it.
function bindDiagramHover(panelEl, node) {
    const diagram = panelEl.querySelector('.designer-boxmodel');
    if (!diagram) return;
    diagram.addEventListener('mouseover', e => {
        const box = e.target.closest('.dbm-margin, .dbm-border, .dbm-padding, .dbm-content');
        const key = box && sectionKeyOf(box);
        if (key) highlightElement(node, SECTION_COLOR[key]);
    });
    diagram.addEventListener('mouseleave', () => clearHighlight(node));
}

function bindPanel(panelEl, node) {
    if (!panelEl || !node) return;
    bindDiagramHover(panelEl, node);
}

// ── Box/Color/Gradients/Patterns title-bar tabs — see this file's own
// header comment.

const PROPERTY_TABS = [
    { id: 'diagram',   label: _('Box view') },
    { id: 'map',       label: _('Color') },
    { id: 'gradients', label: _('Gradients') },
    { id: 'patterns',  label: _('Patterns') }
];

const DELEGATE_TABS = {
    map: () => app.designer.colorHistory?.renderMapInto
};
const LAZY_TABS = { gradients: 'designer_gradients_panel.js', patterns: 'designer_patterns_panel.js' };

let activePropTab = 'diagram';

function titleTabsHTML() {
    return PROPERTY_TABS.map(t => `<button type="button" class="dbm-tab${t.id === activePropTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
}

// designer_gradients_panel.js/designer_patterns_panel.js are lazy-loaded on
// first visit to their own tab (not part of designer.js's eager boot chain,
// same reasoning as every other on-demand dialog in this program). Re-reads
// activePropTab after the async load completes so a since-switched-away tab
// doesn't get overwritten with stale content, and re-queries the panel
// element rather than trusting the one closed over, in case a dock-level
// re-render swapped it out while the module was loading.
function renderLazyTab(tabId, panel) {
    const namespace = app.designer[tabId];
    if (namespace) { namespace.renderInto(panel); return; }

    panel.innerHTML = `<p class="designer-boxmodel-empty">${_('Loading…')}</p>`;
    app.includeModule(app.config.local.ProgramRoot + 'designer/' + LAZY_TABS[tabId])
        .then(mod => mod?.init?.(app))
        .then(() => {
            if (activePropTab !== tabId) return;
            const freshPanel = document.querySelector('[data-dock-id="properties"] .designer-dock-content');
            app.designer[tabId]?.renderInto(freshPanel);
        });
}

// Rewrites both `.dock-title` and `.designer-dock-content` on every call —
// needed even for a same-panel content-only update, since a full dock-level
// re-render (drag-reorder, resize, saveLayout/loadLayout) rebuilds the whole
// panel, title included, from designer_dock.js's own stored (plain, tab-
// less) title string every time; this re-asserts the tab markup right
// after, same reasoning as designer_layers_panel.js's own render().
function render() {
    const panelRoot = document.querySelector('[data-dock-id="properties"]');
    if (!panelRoot) return;

    const titleEl = panelRoot.querySelector('.dock-title');
    if (titleEl) {
        titleEl.innerHTML = titleTabsHTML();
        titleEl.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (activePropTab === btn.dataset.tab) return;
                activePropTab = btn.dataset.tab;
                render();
            });
        });
    }

    const panel = panelRoot.querySelector('.designer-dock-content');
    if (!panel) return;
    panel.dataset.tab = activePropTab;

    if (DELEGATE_TABS[activePropTab]) {
        DELEGATE_TABS[activePropTab]()?.(panel);
        return;
    }
    if (LAZY_TABS[activePropTab]) {
        renderLazyTab(activePropTab, panel);
        return;
    }

    const node = selectedNode();
    refreshResolvedSources(node);
    panel.innerHTML = panelHTML(node);
    bindPanel(panel, node);
}

function injectCSS() {
    if (document.getElementById('designer-boxmodel-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-boxmodel-style';
    style.textContent = `
        [data-dock-id="properties"] .dock-title {
            display: flex; align-items: stretch; gap: 0; overflow-x: auto; overflow-y: hidden; height: 100%;
            scrollbar-width: none; -ms-overflow-style: none;
        }
        [data-dock-id="properties"] .dock-title::-webkit-scrollbar { display: none; }
        .dbm-tab {
            font-size: 11px; background: transparent; color: rgba(255,255,255,0.55);
            border: none; padding: 0 12px; cursor: pointer; flex: 0 0 auto; height: 100%;
        }
        .dbm-tab:hover { color: #ffffff; }
        .dbm-tab.active { color: #ffffff; font-weight: 600; background: var(--theme-backgruondcolord); }

        .designer-boxmodel-empty { font-size: 11px; opacity: 0.5; margin: 0; }
        .dbm-box {
            display: grid;
            grid-template-columns: 24px 1fr 24px;
            grid-template-rows: 18px 1fr 18px;
            position: relative;
            box-sizing: border-box;
        }
        .dbm-margin  { height: 148px; border: 1px dashed rgba(255,255,255,0.25); background: #3d2f1f; }
        .dbm-border  { border: 1px solid rgba(255,220,120,0.35); background: #3d3a1f; }
        .dbm-padding { border: 1px solid rgba(140,210,255,0.3); background: #1f3340; }
        .dbm-content { display: flex; align-items: center; justify-content: center; background: rgba(77,163,255,0.28); border-radius: 2px; text-align: center; }
        .dbm-label { position: absolute; top: 2px; left: 4px; font-size: 8px; letter-spacing: 0.5px; text-transform: uppercase; opacity: 0.45; pointer-events: none; }
        .dbm-num { font-size: 10px; color: #fff; opacity: 0.75; pointer-events: none; }
        .dbm-num-top    { grid-column: 2; grid-row: 1; justify-self: center; align-self: center; }
        .dbm-num-right  { grid-column: 3; grid-row: 2; justify-self: center; align-self: center; }
        .dbm-num-bottom { grid-column: 2; grid-row: 3; justify-self: center; align-self: center; }
        .dbm-num-left   { grid-column: 1; grid-row: 2; justify-self: center; align-self: center; }
        .dbm-inner        { grid-column: 2; grid-row: 2; }
        .dbm-content-size { font-size: 10px; color: #fff; opacity: 0.85; }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    injectCSS();

    app.designer = app.designer || {};
    app.designer.dock.add({ id: 'properties', sort: 10, title: _('Properties'), html: panelHTML(selectedNode()) });

    app.designer.boxmodelPanel = { previewLiveDimension };

    app.designer.dock._registerRenderHook(render);

    app.designer._registerRenderHook(render);

    $(document).on('designer-selection-changed', render);

    render();
}
