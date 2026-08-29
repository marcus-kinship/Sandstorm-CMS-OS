/**
 * @file designer/designer_groups_panel.js
 * @description "Groups" dock panel (`#designerProperties`, dock id `groups`)
 * — Step 6 of the Style Binding rework (per direct feedback): the real
 * working sections — BOX / POSITION / TEXT / BACKGROUND / BORDER / EFFECTS
 * — switched by tabs living in the panel's own title bar — same mechanism
 * designer_layers_panel.js's Layers/Elements pair uses (overwriting
 * designer_dock.js's plain `.dock-title` text directly). An earlier pass
 * tried a tab row inside the content area instead, reasoning six labels
 * wouldn't fit a title bar the way two did; corrected per direct follow-up
 * feedback to match Layers/Elements exactly — the title bar scrolls
 * horizontally instead (see injectCSS()) rather than wrapping. Only one
 * section renders at a time instead of a long stacked scroll, each a plain
 * UI layer over the
 * *same* cascade already built in Steps 1-5, not a separate system: every
 * `node.style`-backed field reads through `resolveComputedStyle`/
 * `resolveStyleSources` (source badge: ⚡ inline / 🎨 class / # id, same as
 * designer_boxmodel_panel.js's Properties panel) and every commit still
 * always writes inline via `app.designer.style.*` — "Move to class" is a
 * later step, this one is read-aware, write-inline-only, same as Step 4.
 *
 * Per direct decision this panel **coexists** with the existing scattered
 * controls (Properties' Margin/Border/Padding/Width/Height, the Cursor
 * bar's Fill/Line/B/H/Z, the Text-tool toolbar, the Border dialog) rather
 * than replacing them — consolidation is a later, separately-decided step.
 * To keep the overlap useful rather than redundant, BOX still covers the
 * full box model (matching the roadmap's own field list) but Width/Height
 * are plain px-only fields (no unit dropdown — Properties' own version
 * already covers that), and BORDER/EFFECTS skip fields already well-served
 * elsewhere (border width, fill color) in favor of an "Edit..." button into
 * the existing dialog (Border dialog / the fx Animation dialog) rather than
 * reimplementing gradient borders or keyframes a second time here.
 *
 * The ACTION group from the roadmap (on click/hover/navigate/run action)
 * is deliberately **not** part of this panel — per direct decision, that's
 * not CSS at all (no data model exists for it yet) and deserves its own
 * architecture step, the same way Style Binding itself got one.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`,
 * alongside designer_layers_panel.js/designer_boxmodel_panel.js — needs the
 * dock (`app.designer.dock`), the object model (`getDocument()`/
 * `selection`), the color system (`colorElement`/`colorPicker`), and
 * `app.designer.stylesheet` (Step 1-3) all ready first.
 *
 * @module program/designer/designer_groups_panel
 */

const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
const BOX_PROP_OF = { margin: s => `margin${s}`, padding: s => `padding${s}` };

const LAYOUT_MODE_OPTIONS = [
    { value: 'flow',     label: _('Flow') },
    { value: 'flex',     label: _('Flex') },
    { value: 'grid',     label: _('Grid') },
    { value: 'absolute', label: _('Absolute') }
];

const FLEX_DIRECTION_OPTIONS = [
    { value: 'row',    label: _('Row') },
    { value: 'column', label: _('Column') }
];

const FONT_WEIGHT_OPTIONS = [
    { value: '',    label: _('Default') },
    { value: '300', label: _('Light') },
    { value: '400', label: _('Regular') },
    { value: '600', label: _('Semibold') },
    { value: '700', label: _('Bold') },
    { value: '900', label: _('Black') }
];

const BORDER_STYLE_OPTIONS = [
    { value: 'none',   label: _('None') },
    { value: 'solid',  label: _('Solid') },
    { value: 'dashed', label: _('Dashed') },
    { value: 'dotted', label: _('Dotted') },
    { value: 'double', label: _('Double') }
];

const SIZE_UNITS = [
    { value: 'px',  label: 'px' },
    { value: 'em',  label: 'em' },
    { value: 'rem', label: 'rem' },
    { value: '%',   label: '%' },
    { value: 'pt',  label: 'pt' }
];

function parseSize(raw) {
    const m = /^(-?\d*\.?\d+)\s*([a-z%]*)$/i.exec(String(raw ?? '').trim());
    if (!m) return { number: '', unit: 'px' };
    return { number: m[1], unit: m[2] || 'px' };
}

let _uiReady = null;
function loadDropmenuDep(app) {
    _uiReady = app.ui?.dropmenu
        ? Promise.resolve()
        : app.includeModule(app.config.local.ComponentsRoot + 'ui/dropmenu.js').then(mod => mod?.setup?.(app));
    _uiReady.then(() => render());
}

function selectedNode() {
    const doc = app.designer.getDocument?.();
    const id = app.designer.selection?.get?.();
    return id ? doc?.find(id) : null;
}

let resolvedSources = new Map();
function refreshResolvedSources(node) {
    resolvedSources = new Map();
    if (!node) return;
    (app.designer.stylesheet?.resolveStyleSources?.(node) || []).forEach(s => resolvedSources.set(s.property, s));
}

function fieldValue(node, prop) {
    const src = resolvedSources.get(prop);
    return src ? src.value : node.style?.[prop];
}

function fieldSource(prop) {
    return resolvedSources.get(prop) || null;
}

const SOURCE_BADGE = { inline: { symbol: '⚡', color: '#e2a53d' }, class: { symbol: '🎨', color: '#4da3ff' }, id: { symbol: '#', color: '#b06fe0' } };

function sourceBadgeHTML(src) {
    if (!src) return '';
    const badge = SOURCE_BADGE[src.source];
    if (!badge) return '';
    const label = src.selector ? `${src.source}: ${src.selector}` : src.source;
    return `<span class="dgp-badge" style="color:${badge.color}" title="${app.util.escapeHtml(label)}">${badge.symbol}</span>`;
}

// ── Generic commits ───────────────────────────────────────────────────────

// node.layout.* has no core/style.js equivalent (same reasoning as
// designer_boxmodel_panel.js's own commitSize/designer_toolbar.js's
// commitDim) — plain do/undo/redo, no cascade/badge (layout isn't part of
// the class/id stylesheet model at all).
function commitLayout(node, key, value, title) {
    const before = node.layout?.[key];
    if (value === before) return;
    const apply = (v) => {
        node.layout = node.layout || {};
        if (v === undefined) { const { [key]: _omit, ...rest } = node.layout; node.layout = rest; }
        else node.layout[key] = v;
        app.designer.render();
    };
    const session = app.designer.win?.history;
    if (session) session.execute({ type: 'node.layout', title, do: () => apply(value), undo: () => apply(before), redo: () => apply(value) });
    else apply(value);
}

function numOrUndefined(raw) {
    const n = parseFloat(raw);
    return (raw === '' || raw == null || Number.isNaN(n)) ? undefined : n;
}

function pxOrUndefined(raw) {
    const n = numOrUndefined(raw);
    return n === undefined ? undefined : `${n}px`;
}

// ── Section shell ────────────────────────────────────────────────────────

function rowHTML(label, controlHTML) {
    return `<div class="dgp-row"><span class="dgp-row-label">${label}</span>${controlHTML}</div>`;
}

// All four sides sourced from the exact same place (source AND selector,
// not just source) -> that source; anything else -> null (no badge) rather
// than guessing/picking one side's source and misrepresenting the other
// three. Same reasoning designer_boxmodel_panel.js's own (now-removed)
// commonSource used.
function commonFieldSource(propOf) {
    const srcs = SIDES.map(side => fieldSource(propOf(side)));
    const first = srcs[0];
    const allSame = srcs.every(s => s?.source === first?.source && s?.selector === first?.selector);
    return allSame ? first : null;
}

// Linked control for a 4-side group (Margin/Padding): one field + unit
// dropdown editing all four sides together, plus a small grid-icon button
// opening designer_sides_dialog.js for per-side editing — per direct
// feedback, back to this single-field style (matching the old Properties
// panel's own linked mode) instead of always showing four separate inputs;
// the 4-way editor moves into its own small window instead of an inline
// expand/collapse toggle.
function linkedGroupHTML(key, node) {
    const propOf = BOX_PROP_OF[key];
    const vals = SIDES.map(side => fieldValue(node, propOf(side)));
    const allSame = vals.every(v => v === vals[0]);
    const { number, unit } = parseSize(allSame ? vals[0] : '');
    return (
        `<input type="number" class="dgp-input" data-linked-key="${key}" value="${number}" placeholder="0">` +
        `<span class="dgp-mount dgp-unit-mount" data-mount="${key}-unit" data-unit="${unit}"></span>` +
        `<button type="button" class="dgp-icon-btn" data-action="open-sides" data-key="${key}" title="${_('Edit all four sides…')}">` +
            `<svg viewBox="0 0 16 16" width="12" height="12">` +
                `<rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.3"/>` +
                `<line x1="2.5" y1="6.3" x2="13.5" y2="6.3" stroke="currentColor" stroke-width="1"/>` +
                `<line x1="2.5" y1="9.7" x2="13.5" y2="9.7" stroke="currentColor" stroke-width="1"/>` +
                `<line x1="6.3" y1="2.5" x2="6.3" y2="13.5" stroke="currentColor" stroke-width="1"/>` +
                `<line x1="9.7" y1="2.5" x2="9.7" y2="13.5" stroke="currentColor" stroke-width="1"/>` +
            `</svg>` +
        `</button>` +
        sourceBadgeHTML(commonFieldSource(propOf))
    );
}

function commitLinkedGroup(node, key, raw, unit) {
    const propOf = BOX_PROP_OF[key];
    const n = parseFloat(raw);
    const value = (raw === '' || raw == null || Number.isNaN(n)) ? undefined : `${n}${unit}`;
    const propsMap = Object.fromEntries(SIDES.map(side => [propOf(side), value]));
    app.designer.style.setProperties(node, propsMap, _('Changed') + ' ' + key);
}

function bindLinkedGroup(root, node, key) {
    const input = root.querySelector(`[data-linked-key="${key}"]`);
    const unitMount = root.querySelector(`[data-mount="${key}-unit"]`);

    if (app.ui?.dropmenu && unitMount) {
        unitMount.innerHTML = app.ui.dropmenu({ options: SIZE_UNITS, selected: unitMount.dataset.unit || 'px' });
        app.ui.dropmenu.initAll();
        const unitEl = unitMount.querySelector('.ui-dropmenu');
        if (unitEl) {
            unitEl.style.height = '22px';
            unitEl.style.marginBottom = '0';
            unitEl.style.fontSize = '10px';
            unitEl.addEventListener('change', () => { if (input?.value !== '') commitLinkedGroup(node, key, input.value, unitEl.value); });
        }
    }

    input?.addEventListener('change', () => {
        const unit = unitMount?.querySelector('.ui-dropmenu')?.value || 'px';
        commitLinkedGroup(node, key, input.value, unit);
    });

    root.querySelector(`[data-action="open-sides"][data-key="${key}"]`)?.addEventListener('click', () => openSidesDialogFor(node, key));
}

// Lazy-loaded on first click only, same idiom as this file's own
// openBorderDialogFor/openAnimationDialogFor.
function openSidesDialogFor(node, key) {
    if (app.designer.sidesDialog?.open) { app.designer.sidesDialog.open({ node, key }); return; }
    app.includeModule(app.config.local.ProgramRoot + 'designer/designer_sides_dialog.js')
        .then(mod => mod?.init?.(app))
        .then(() => app.designer.sidesDialog.open({ node, key }));
}

// ── BOX ──────────────────────────────────────────────────────────────────

function boxSectionHTML(node) {
    const w = node.layout?.width, h = node.layout?.height;
    const wn = parseFloat(w), hn = parseFloat(h);
    return (
        rowHTML(_('Mode'), `<span class="dgp-mount" data-mount="layout-mode"></span>`) +
        rowHTML(_('Direction'), `<span class="dgp-mount" data-mount="flex-direction"></span>`) +
        rowHTML(_('Width'), `<input type="number" class="dgp-input" data-dim="width" value="${Number.isFinite(wn) ? wn : ''}" placeholder="${_('auto')}">`) +
        rowHTML(_('Height'), `<input type="number" class="dgp-input" data-dim="height" value="${Number.isFinite(hn) ? hn : ''}" placeholder="${_('auto')}">`) +
        rowHTML(_('Gap'), `<input type="number" class="dgp-input" data-dim="gap" value="${node.layout?.gap ?? ''}" placeholder="0">`) +
        rowHTML(_('Margin'), linkedGroupHTML('margin', node)) +
        rowHTML(_('Padding'), linkedGroupHTML('padding', node))
    );
}

function bindBoxSection(root, node) {
    const modeMount = root.querySelector('[data-mount="layout-mode"]');
    const dirMount = root.querySelector('[data-mount="flex-direction"]');
    if (app.ui?.dropmenu && modeMount) {
        modeMount.innerHTML = app.ui.dropmenu({ options: LAYOUT_MODE_OPTIONS, selected: node.layout?.mode || 'flow' });
        dirMount.innerHTML = app.ui.dropmenu({ options: FLEX_DIRECTION_OPTIONS, selected: node.layout?.direction || 'row' });
        app.ui.dropmenu.initAll();
        modeMount.querySelector('.ui-dropmenu')?.addEventListener('change', e => commitLayout(node, 'mode', e.target.value, _('Changed layout mode')));
        dirMount.querySelector('.ui-dropmenu')?.addEventListener('change', e => commitLayout(node, 'direction', e.target.value, _('Changed direction')));
    }

    root.querySelector('[data-dim="width"]')?.addEventListener('change', e => commitLayout(node, 'width', pxOrUndefined(e.target.value), _('Changed width')));
    root.querySelector('[data-dim="height"]')?.addEventListener('change', e => commitLayout(node, 'height', pxOrUndefined(e.target.value), _('Changed height')));
    root.querySelector('[data-dim="gap"]')?.addEventListener('change', e => commitLayout(node, 'gap', numOrUndefined(e.target.value), _('Changed gap')));

    bindLinkedGroup(root, node, 'margin');
    bindLinkedGroup(root, node, 'padding');
}

// ── POSITION ─────────────────────────────────────────────────────────────

function positionSectionHTML(node) {
    const x = node.layout?.x, y = node.layout?.y;
    const zVal = fieldValue(node, 'zIndex');
    return (
        rowHTML(_('X'), `<input type="number" class="dgp-input" data-dim="x" value="${x ?? ''}" placeholder="${_('auto')}">`) +
        rowHTML(_('Y'), `<input type="number" class="dgp-input" data-dim="y" value="${y ?? ''}" placeholder="${_('auto')}">`) +
        rowHTML(_('Z-index'), `<input type="number" class="dgp-input" data-prop="zIndex" value="${zVal ?? ''}" placeholder="0">` + sourceBadgeHTML(fieldSource('zIndex')))
    );
}

function bindPositionSection(root, node) {
    root.querySelector('[data-dim="x"]')?.addEventListener('change', e => commitLayout(node, 'x', numOrUndefined(e.target.value), _('Changed X')));
    root.querySelector('[data-dim="y"]')?.addEventListener('change', e => commitLayout(node, 'y', numOrUndefined(e.target.value), _('Changed Y')));
    root.querySelector('[data-prop="zIndex"]')?.addEventListener('change', e => {
        const n = parseInt(e.target.value, 10);
        app.designer.style.setProperty(node, 'zIndex', Number.isFinite(n) ? String(n) : undefined, _('Changed z-index'));
    });
}

// ── TEXT ─────────────────────────────────────────────────────────────────

function textSectionHTML(node) {
    const size = fieldValue(node, 'fontSize');
    const sizeN = parseFloat(size);
    const align = fieldValue(node, 'textAlign') || 'left';
    return (
        rowHTML(_('Color'), `<span class="dgp-swatch-mount" data-mount="text-color"></span>` + sourceBadgeHTML(fieldSource('color'))) +
        rowHTML(_('Size'), `<input type="number" class="dgp-input" data-prop="fontSize" value="${Number.isFinite(sizeN) ? sizeN : ''}" placeholder="${_('auto')}">` + sourceBadgeHTML(fieldSource('fontSize'))) +
        rowHTML(_('Weight'), `<span class="dgp-mount" data-mount="font-weight"></span>` + sourceBadgeHTML(fieldSource('fontWeight'))) +
        rowHTML(_('Align'),
            `<div class="dgp-btn-group">` +
                ['left', 'center', 'right'].map(a => `<button type="button" class="dgp-btn${align === a ? ' active' : ''}" data-align="${a}">${_(a.charAt(0).toUpperCase() + a.slice(1))}</button>`).join('') +
            `</div>`
        )
    );
}

function bindTextSection(root, node) {
    const swatchMount = root.querySelector('[data-mount="text-color"]');
    if (swatchMount) {
        const swatch = app.designer.colorElement.create({
            color: fieldValue(node, 'color') || '#000000', width: 18, height: 18,
            onClick: () => {
                app.designer.colorPicker.open({ color: node.style?.color || '#000000' })
                    .then(result => { if (result) app.designer.style.setColor(node, 'color', result); });
            }
        });
        swatchMount.appendChild(swatch.el);
    }

    const weightMount = root.querySelector('[data-mount="font-weight"]');
    if (app.ui?.dropmenu && weightMount) {
        weightMount.innerHTML = app.ui.dropmenu({ options: FONT_WEIGHT_OPTIONS, selected: fieldValue(node, 'fontWeight') || '' });
        app.ui.dropmenu.initAll();
        weightMount.querySelector('.ui-dropmenu')?.addEventListener('change', e => app.designer.style.setProperty(node, 'fontWeight', e.target.value || undefined, _('Changed font weight')));
    }

    root.querySelector('[data-prop="fontSize"]')?.addEventListener('change', e => {
        app.designer.style.setProperty(node, 'fontSize', pxOrUndefined(e.target.value), _('Changed font size'));
    });

    root.querySelectorAll('[data-align]').forEach(btn => {
        btn.addEventListener('click', () => app.designer.style.setProperty(node, 'textAlign', btn.dataset.align, _('Changed text alignment')));
    });
}

// ── BACKGROUND ───────────────────────────────────────────────────────────

function backgroundSectionHTML(node) {
    return rowHTML(_('Color'), `<span class="dgp-swatch-mount" data-mount="bg-color"></span>` + sourceBadgeHTML(fieldSource('backgroundColor')));
}

function bindBackgroundSection(root, node) {
    const mount = root.querySelector('[data-mount="bg-color"]');
    if (!mount) return;
    const swatch = app.designer.colorElement.create({
        color: fieldValue(node, 'backgroundColor') || 'rgba(0,0,0,0)', width: 18, height: 18,
        onClick: () => {
            app.designer.colorPicker.open({ color: node.style?.backgroundColor || '#ffffff' })
                .then(result => { if (result) app.designer.style.setColor(node, 'backgroundColor', result); });
        }
    });
    mount.appendChild(swatch.el);
}

// ── BORDER ───────────────────────────────────────────────────────────────

function borderSectionHTML(node) {
    return (
        rowHTML(_('Style'), `<span class="dgp-mount" data-mount="border-style"></span>` + sourceBadgeHTML(fieldSource('borderStyle'))) +
        rowHTML(_('Color'), `<span class="dgp-swatch-mount" data-mount="border-color"></span>` + sourceBadgeHTML(fieldSource('borderColor'))) +
        `<button type="button" class="aero-button xs dgp-edit-btn" data-action="edit-border">${_('Edit border…')}</button>`
    );
}

function bindBorderSection(root, node) {
    const styleMount = root.querySelector('[data-mount="border-style"]');
    if (app.ui?.dropmenu && styleMount) {
        styleMount.innerHTML = app.ui.dropmenu({ options: BORDER_STYLE_OPTIONS, selected: fieldValue(node, 'borderStyle') || 'none' });
        app.ui.dropmenu.initAll();
        styleMount.querySelector('.ui-dropmenu')?.addEventListener('change', e => app.designer.style.setProperty(node, 'borderStyle', e.target.value === 'none' ? undefined : e.target.value, _('Changed border style')));
    }

    const colorMount = root.querySelector('[data-mount="border-color"]');
    if (colorMount) {
        const swatch = app.designer.colorElement.create({
            color: fieldValue(node, 'borderColor') || '#000000', width: 18, height: 18,
            onClick: () => {
                app.designer.colorPicker.open({ color: node.style?.borderColor || '#000000' })
                    .then(result => { if (result) app.designer.style.setColor(node, 'borderColor', result); });
            }
        });
        colorMount.appendChild(swatch.el);
    }

    root.querySelector('[data-action="edit-border"]')?.addEventListener('click', () => openBorderDialogFor(node));
}

// Lazy-loaded on first click only, same idiom as designer_boxmodel_panel.js's
// own openBorderDialog / designer_layers_panel.js's openAnimationDialog.
function openBorderDialogFor(node) {
    if (app.designer.borderDialog?.open) { app.designer.borderDialog.open({ node }); return; }
    app.includeModule(app.config.local.ProgramRoot + 'designer/designer_border_dialog.js')
        .then(mod => mod?.init?.(app))
        .then(() => app.designer.borderDialog.open({ node }));
}

function openAnimationDialogFor(node) {
    if (app.designer.animationDialog?.open) { app.designer.animationDialog.open({ node }); return; }
    app.includeModule(app.config.local.ProgramRoot + 'designer/designer_animation_dialog.js')
        .then(mod => mod?.init?.(app))
        .then(() => app.designer.animationDialog.open({ node }));
}

// ── EFFECTS ──────────────────────────────────────────────────────────────

function effectsSectionHTML(node) {
    const opacity = fieldValue(node, 'opacity');
    const shadow = fieldValue(node, 'boxShadow') || '';
    return (
        rowHTML(_('Opacity'), `<input type="number" class="dgp-input" data-prop="opacity" min="0" max="1" step="0.05" value="${opacity ?? ''}" placeholder="1">` + sourceBadgeHTML(fieldSource('opacity'))) +
        rowHTML(_('Box Shadow'), `<input type="text" class="dgp-input dgp-input-wide" data-prop="boxShadow" value="${app.util.escapeHtml(shadow)}" placeholder="0 2px 8px rgba(0,0,0,.3)">` + sourceBadgeHTML(fieldSource('boxShadow'))) +
        `<button type="button" class="aero-button xs dgp-edit-btn" data-action="edit-animation">${_('Edit animation…')}</button>`
    );
}

function bindEffectsSection(root, node) {
    root.querySelector('[data-prop="opacity"]')?.addEventListener('change', e => {
        app.designer.style.setProperty(node, 'opacity', numOrUndefined(e.target.value), _('Changed opacity'));
    });
    root.querySelector('[data-prop="boxShadow"]')?.addEventListener('change', e => {
        app.designer.style.setProperty(node, 'boxShadow', e.target.value || undefined, _('Changed box shadow'));
    });
    root.querySelector('[data-action="edit-animation"]')?.addEventListener('click', () => openAnimationDialogFor(node));
}

// ── Panel shell ──────────────────────────────────────────────────────────

const GROUP_TABS = [
    { id: 'box',        label: _('Box'),        html: boxSectionHTML,        bind: bindBoxSection },
    { id: 'position',   label: _('Position'),   html: positionSectionHTML,   bind: bindPositionSection },
    { id: 'text',       label: _('Text'),       html: textSectionHTML,       bind: bindTextSection },
    { id: 'background', label: _('Background'), html: backgroundSectionHTML, bind: bindBackgroundSection },
    { id: 'border',     label: _('Border'),     html: borderSectionHTML,     bind: bindBorderSection },
    { id: 'effects',    label: _('Effects'),    html: effectsSectionHTML,    bind: bindEffectsSection }
];

let activeGroupTab = 'box';

function activeTab() {
    return GROUP_TABS.find(t => t.id === activeGroupTab) || GROUP_TABS[0];
}

// Stands in for designer_dock.js's own plain-text `.dock-title` — rendered
// straight into that element (not into `.designer-dock-content`), so its
// own click handlers are bound separately in render() below, scoped to
// `.dock-title` rather than the content panel.
function titleTabsHTML() {
    return GROUP_TABS.map(t => `<button type="button" class="dgp-tab${t.id === activeGroupTab ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
}

function panelHTML(node) {
    if (!node) return `<p class="dgp-empty">${_('Select an element to edit its groups')}</p>`;
    return activeTab().html(node);
}

// Rewrites both `.dock-title` and `.designer-dock-content` on every call —
// needed even for a same-panel content-only update, since a full dock-level
// re-render (drag-reorder, resize, saveLayout/loadLayout) rebuilds the whole
// panel, title included, from designer_dock.js's own stored (plain, tab-
// less) title string every time; this re-asserts the tab markup right
// after, same reasoning as designer_layers_panel.js's own render().
function render() {
    const panelRoot = document.querySelector('[data-dock-id="groups"]');
    if (!panelRoot) return;

    const titleEl = panelRoot.querySelector('.dock-title');
    if (titleEl) {
        titleEl.innerHTML = titleTabsHTML();
        titleEl.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (activeGroupTab === btn.dataset.tab) return;
                activeGroupTab = btn.dataset.tab;
                render();
            });
        });
    }

    const panel = panelRoot.querySelector('.designer-dock-content');
    if (!panel) return;
    const node = selectedNode();
    refreshResolvedSources(node);
    panel.innerHTML = panelHTML(node);
    if (node) activeTab().bind(panel, node);
}

function injectCSS() {
    if (document.getElementById('designer-groups-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-groups-style';
    style.textContent = `
        .dgp-empty { font-size: 11px; opacity: 0.5; margin: 0; }

        [data-dock-id="groups"] .dock-title {
            display: flex; align-items: stretch; gap: 0; overflow-x: auto; overflow-y: hidden; height: 100%;
            scrollbar-width: none; -ms-overflow-style: none;
        }
        [data-dock-id="groups"] .dock-title::-webkit-scrollbar { display: none; }
        .dgp-tab {
            font-size: 10px; white-space: nowrap; background: transparent; color: rgba(255,255,255,0.55);
            border: none; padding: 0 10px; cursor: pointer; flex: 0 0 auto; height: 100%;
        }
        .dgp-tab:hover { color: #ffffff; }
        .dgp-tab.active { color: #ffffff; font-weight: 600; background: var(--theme-backgruondcolord); }
        .dgp-section { margin-bottom: 4px; }
        .dgp-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
        .dgp-row-label { width: 60px; flex: 0 0 60px; font-size: 10px; opacity: 0.65; }
        .dgp-mount, .dgp-swatch-mount { flex: 1; min-width: 0; }
        .dgp-mount .ui-dropmenu { width: 100%; box-sizing: border-box; height: 22px; font-size: 10px; }
        .dgp-input {
            width: 100%; flex: 1; min-width: 0; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.15);
            border-radius: 2px; font-size: 10px; padding: 3px 5px; box-sizing: border-box;
        }
        .dgp-input-wide { flex: 1; }
        .dgp-input::-webkit-inner-spin-button, .dgp-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .dgp-input { -moz-appearance: textfield; }
        .dgp-input:focus { outline: none; border-color: #4da3ff; background: rgba(0,0,0,0.45); }
        .dgp-unit-mount { flex: 0 0 44px; }
        .dgp-icon-btn {
            width: 22px; height: 22px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 2px; color: rgba(255,255,255,0.7); cursor: pointer;
        }
        .dgp-icon-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }
        .dgp-badge { font-size: 8px; line-height: 1; flex-shrink: 0; }
        .dgp-btn-group { display: flex; gap: 3px; flex: 1; }
        .dgp-btn { flex: 1; background: rgba(0,0,0,0.3); color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.15); border-radius: 2px; font-size: 9px; padding: 3px 0; cursor: pointer; }
        .dgp-btn:hover { color: #fff; }
        .dgp-btn.active { color: #fff; background: var(--theme-backgruondcolorc, #00000040); border-color: #4da3ff; }
        .aero-button.dgp-edit-btn { width: 100%; margin-top: 2px; }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    if (!app.designer?.dock) return;

    injectCSS();
    loadDropmenuDep(app);

    app.designer.dock.add({ id: 'groups', sort: 15, title: _('Groups'), html: panelHTML(selectedNode()) });

    app.designer.dock._registerRenderHook(render);
    app.designer._registerRenderHook(render);
    $(document).on('designer-selection-changed', render);

    render();
}
