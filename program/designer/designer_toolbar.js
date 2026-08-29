/**
 * @file designer/designer_toolbar.js
 * @description "#designerToolbar" — the horizontal bar directly above the
 * canvas (designer.js's own template already reserves this element). Two
 * mutually-exclusive bars share it, switched by `barContentHTML()` on every
 * render:
 *
 *  - Text Tool active (`app.designer.activeTool === 'text'`) with the
 *    selection empty or itself a `type:'text'` node → the text-formatting
 *    bar (tag/font/size/weight/anti-aliasing/align/color).
 *  - Otherwise, whenever a node is selected → the "Cursor" bar: quick
 *    visual/layout controls for that one node (selection-outline visibility,
 *    fill color, border line-style, width/height with an optional
 *    aspect-ratio lock, z-index). Adding/removing/reordering *children* of
 *    the selection is no longer this bar's job — that now lives in the
 *    right sidebar's "Elements" dock panel (designer_elements_panel.js),
 *    per direct feedback: Cursor marks up and transforms an existing block,
 *    it doesn't build the tree.
 *
 * Every Cursor-bar control writes straight into the selected node's own
 * `style`/`layout`, the same generic bags every other style-setting path in
 * this program already uses (core/style.js's buildStyle() picks up any
 * `node.style` key automatically; width/height live on `node.layout`, same
 * as designer_boxmodel_panel.js's own Width/Height row) — no renderer or
 * object-model change needed for any of it.
 *
 * Lazy-loaded via `app.includeModule` from `designer.js`'s `start()`,
 * alongside designer_layers_panel.js/designer_history_log.js — needs the
 * object model (`getDocument()`/selection) and `app.designer.style`/
 * `colorElement`/`colorPicker` (the color system, loaded earlier in
 * designer.js's own chain).
 *
 * @module program/designer/designer_toolbar
 */

function selectedNode() {
    const doc = app.designer.getDocument?.();
    const id = app.designer.selection?.get?.();
    return id ? doc?.find(id) : null;
}

const ANTIALIAS_OPTIONS = [
    { value: '',            label: _('Default') },
    { value: 'antialiased', label: _('Smooth') },
    { value: 'none',        label: _('Sharp') }
];

const TAG_OPTIONS = [
    { value: 'h1',   label: _('Heading 1') },
    { value: 'h2',   label: _('Heading 2') },
    { value: 'h3',   label: _('Heading 3') },
    { value: 'h4',   label: _('Heading 4') },
    { value: 'h5',   label: _('Heading 5') },
    { value: 'h6',   label: _('Heading 6') },
    { value: 'p',    label: _('Body Text') },
    { value: 'code', label: _('Code') }
];

const FONT_SIZE_PRESETS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 120, 144];

const FONT_WEIGHT_OPTIONS = [
    { value: '',    label: _('Default') },
    { value: '100', label: _('Thin') },
    { value: '200', label: _('Extra Light') },
    { value: '300', label: _('Light') },
    { value: '400', label: _('Regular') },
    { value: '500', label: _('Medium') },
    { value: '600', label: _('Semibold') },
    { value: '700', label: _('Bold') },
    { value: '800', label: _('Extra Bold') },
    { value: '900', label: _('Black') }
];

const FONT_SIZE_UNITS = [
    { value: 'px',  label: 'px' },
    { value: 'em',  label: 'em' },
    { value: 'rem', label: 'rem' },
    { value: '%',   label: '%' },
    { value: 'pt',  label: 'pt' }
];

/** Splits a CSS length like "16px" into { number: "16", unit: "px" }; defaults to "px" when unset/unparseable. */
function parseFontSize(raw) {
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

// `node` is null whenever the Text Tool is active but nothing is selected/
// created yet — styleOf() then falls back to app.designer.textTool's staged
// pendingStyle, so the bar (and every control below) works identically
// either way; only where the value actually gets written differs (see
// setFontFamily/setFontSize/setAntialiasing/setAlign/mountColorSwatches).
function styleOf(node) {
    return node ? (node.style || {}) : (app.designer.textTool?.getPendingStyle() || {});
}

function textBarHTML(node) {
    const style = styleOf(node);
    const align = style.textAlign || 'left';
    const { number: sizeNumber } = parseFontSize(style.fontSize);

    return (
        `<span class="designer-toolbar-dropdown-mount designer-toolbar-tag-mount" data-mount="tag" title="${_('Text type')}"></span>` +
        `<span class="designer-toolbar-dropdown-mount designer-toolbar-font-mount" data-mount="font-family" title="${_('Font family')}"></span>` +
        `<span class="designer-toolbar-dropdown-mount designer-toolbar-weight-mount" data-mount="font-weight" title="${_('Font weight')}"></span>` +
        `<div class="designer-toolbar-size-combo" title="${_('Font size')}">` +
            `<input type="number" class="designer-toolbar-size-input" data-action="font-size" min="1" value="${sizeNumber}" placeholder="${_('size')}">` +
            `<button type="button" class="designer-toolbar-size-arrow" data-action="font-size-arrow" title="${_('Preset sizes')}"><svg viewBox="0 0 10 10" width="9" height="9"><path d="M5 8 L9 2 L1 2 Z" fill="#ffffff" opacity="0.6"/></svg></button>` +
            `<div class="designer-toolbar-size-options">` +
                FONT_SIZE_PRESETS.map(n => `<div class="designer-toolbar-size-option" data-value="${n}">${n}</div>`).join('') +
            `</div>` +
        `</div>` +
        `<span class="designer-toolbar-dropdown-mount designer-toolbar-unit-mount" data-mount="font-size-unit" title="${_('Unit')}"></span>` +
        `<span class="designer-toolbar-dropdown-mount designer-toolbar-antialias-mount" data-mount="antialias" title="${_('Anti-aliasing')}"></span>` +
        `<button class="designer-toolbar-btn designer-toolbar-btn-icon${align === 'left'   ? ' active' : ''}" data-action="align-left"   title="${_('Align left')}"><svg><use href="#ic-designer-align-left"></use></svg></button>` +
        `<button class="designer-toolbar-btn designer-toolbar-btn-icon${align === 'center' ? ' active' : ''}" data-action="align-center" title="${_('Align center')}"><svg><use href="#ic-designer-align-center"></use></svg></button>` +
        `<button class="designer-toolbar-btn designer-toolbar-btn-icon${align === 'right'  ? ' active' : ''}" data-action="align-right"  title="${_('Align right')}"><svg><use href="#ic-designer-align-right"></use></svg></button>` +
        `<span class="designer-toolbar-swatch-mount" data-mount="text-color" title="${_('Text color')}"></span>` +
        `<span class="designer-toolbar-swatch-mount" data-mount="bg-color" title="${_('Background color')}"></span>`
    );
}

function combinedHistory(title, doFn, undoFn) {
    const session = app.designer.win?.history;
    if (session) session.execute({ type: 'style.combined', title, do: doFn, undo: undoFn, redo: doFn });
    else doFn();
}

function setFontFamily(node, name) {
    const value = name || undefined;
    if (node) app.designer.style.setProperty(node, 'fontFamily', value, _('Changed font family'));
    else { app.designer.textTool.setPendingStyle('fontFamily', value); render(); }
}

function setFontWeight(node, weight) {
    const value = weight || undefined;
    if (node) app.designer.style.setProperty(node, 'fontWeight', value, _('Changed font weight'));
    else { app.designer.textTool.setPendingStyle('fontWeight', value); render(); }
}

function setFontSize(node, raw, unit = 'px') {
    const n = parseFloat(raw);
    const value = (raw === '' || raw == null || Number.isNaN(n)) ? undefined : `${n}${unit}`;
    if (node) app.designer.style.setProperty(node, 'fontSize', value, _('Changed font size'));
    else { app.designer.textTool.setPendingStyle('fontSize', value); render(); }
}

// -webkit-font-smoothing + text-rendering together — one user action, one undo step.
function setAntialiasing(node, smoothing) {
    const rendering = smoothing === 'none' ? 'optimizeSpeed' : smoothing === 'antialiased' ? 'optimizeLegibility' : undefined;
    if (!node) {
        app.designer.textTool.setPendingStyle('WebkitFontSmoothing', smoothing || undefined);
        app.designer.textTool.setPendingStyle('textRendering', rendering);
        render();
        return;
    }
    const beforeSmoothing = node.style?.WebkitFontSmoothing;
    const beforeRendering = node.style?.textRendering;
    const apply = (s, r) => {
        node.style = node.style || {};
        if (!s) delete node.style.WebkitFontSmoothing; else node.style.WebkitFontSmoothing = s;
        if (!r) delete node.style.textRendering;       else node.style.textRendering       = r;
        app.designer.render();
    };
    combinedHistory(_('Changed anti-aliasing'), () => apply(smoothing || undefined, rendering), () => apply(beforeSmoothing, beforeRendering));
}

function setAlign(node, align) {
    if (node) app.designer.style.setProperty(node, 'textAlign', align, _('Changed text alignment'));
    else { app.designer.textTool.setPendingStyle('textAlign', align); render(); }
}

// props.tag isn't a style property (core/style.js's setProperty/setColor
// only ever touch node.style), so this writes node.props directly with its
// own small history entry, same pattern as the Cursor bar's dimension
// commits further down.
function setTag(node, tag) {
    if (!node) { app.designer.textTool?.setPendingTag(tag); render(); return; }
    const before = node.props.tag;
    if (before === tag) return;
    const apply = (t) => { node.props.tag = t; app.designer.render(); };
    const session = app.designer.win?.history;
    if (session) {
        session.execute({ type: 'text.tag', title: _('Changed text type'), do: () => apply(tag), undo: () => apply(before), redo: () => apply(tag) });
    } else {
        apply(tag);
    }
}

function mountColorSwatches(barEl, node) {
    const style = styleOf(node);

    const textMount = barEl.querySelector('[data-mount="text-color"]');
    if (textMount) {
        const swatch = app.designer.colorElement.create({
            color: style.color || '#000000', width: 20, height: 20,
            onClick: () => {
                app.designer.colorPicker.open({ color: style.color || '#000000' })
                    .then(result => {
                        if (!result) return;
                        if (node) app.designer.style.setColor(node, 'color', result);
                        else { app.designer.textTool.setPendingStyle('color', result); render(); }
                    });
            }
        });
        textMount.appendChild(swatch.el);
    }

    const bgMount = barEl.querySelector('[data-mount="bg-color"]');
    if (bgMount) {
        const swatch = app.designer.colorElement.create({
            color: style.backgroundColor || 'rgba(0,0,0,0)', width: 20, height: 20,
            onClick: () => {
                app.designer.colorPicker.open({ color: style.backgroundColor || '#ffffff' })
                    .then(result => {
                        if (!result) return;
                        if (node) app.designer.style.setColor(node, 'backgroundColor', result);
                        else { app.designer.textTool.setPendingStyle('backgroundColor', result); render(); }
                    });
            }
        });
        bgMount.appendChild(swatch.el);
    }
}

// Two-column option row: plain name (left) + the same name rendered live in
// its own font-family (right) — a quick visual preview without leaving the
// list, same idea as most design tools' own font pickers.
function fontFamilyOptions() {
    return (app.fonts?.get() || []).map(f => {
        const name = app.util.escapeHtml(f.name);
        return {
            value: f.name,
            title: f.name,
            label: `<span class="designer-toolbar-font-row">` +
                       `<span class="designer-toolbar-font-name">${name}</span>` +
                       `<span class="designer-toolbar-font-preview" style="font-family:'${name}'">${name}</span>` +
                   `</span>`
        };
    });
}

// Font-family and anti-aliasing both render as an app.ui.dropmenu instance
// (sandstorm/components/ui/dropmenu.js) instead of a native <select>, same
// visual language as designer_devicemode.js's own device-preset dropdown —
// mounted into a placeholder span the same way mountColorSwatches() mounts
// its color swatches, since dropmenu only returns an HTML string (no DOM
// node) that has to be inserted then activated via .initAll().
function mountDropdowns(barEl, node) {
    if (!app.ui?.dropmenu) return;
    const style = styleOf(node);
    const currentTag = node ? (node.props?.tag || 'p') : (app.designer.textTool?.getPendingTag?.() || 'p');

    const tagMount = barEl.querySelector('[data-mount="tag"]');
    if (tagMount) {
        tagMount.innerHTML = app.ui.dropmenu({ options: TAG_OPTIONS, selected: currentTag, icon: '#ic-designer-tag' });
    }

    const fontMount = barEl.querySelector('[data-mount="font-family"]');
    if (fontMount) {
        fontMount.innerHTML = app.ui.dropmenu({ options: fontFamilyOptions(), selected: style.fontFamily || '', icon: '#ic-designer-font' });
    }

    const weightMount = barEl.querySelector('[data-mount="font-weight"]');
    if (weightMount) {
        weightMount.innerHTML = app.ui.dropmenu({ options: FONT_WEIGHT_OPTIONS, selected: style.fontWeight || '', icon: '#ic-designer-fontweight' });
    }

    const antialiasMount = barEl.querySelector('[data-mount="antialias"]');
    if (antialiasMount) {
        antialiasMount.innerHTML = app.ui.dropmenu({ options: ANTIALIAS_OPTIONS, selected: style.WebkitFontSmoothing || '', icon: '#ic-designer-antialias' });
    }

    app.ui.dropmenu.initAll();

    [tagMount, fontMount, weightMount, antialiasMount].forEach(mount => {
        const el = mount?.querySelector('.ui-dropmenu');
        if (!el) return;
        el.style.height = '24px';
        el.style.marginBottom = '0';
        el.style.fontSize = '11px';
    });

    tagMount?.querySelector('.ui-dropmenu')?.addEventListener('change', e => setTag(node, e.target.value));
    weightMount?.querySelector('.ui-dropmenu')?.addEventListener('change', e => setFontWeight(node, e.target.value));

    const fontEl = fontMount?.querySelector('.ui-dropmenu');
    if (fontEl) {
        const lbl = fontEl.querySelector('.ui-dropmenu-label');
        const firstValue = fontEl.querySelector('.ui-dropmenu-option')?.dataset.value || '';
        if (lbl) lbl.textContent = fontEl.value || firstValue;
        fontEl.addEventListener('change', () => {
            const lbl2 = fontEl.querySelector('.ui-dropmenu-label');
            if (lbl2) lbl2.textContent = fontEl.value;
            setFontFamily(node, fontEl.value);
        });
    }

    antialiasMount?.querySelector('.ui-dropmenu')?.addEventListener('change', e => setAntialiasing(node, e.target.value));
}

// Font-size combo: a freely-editable number input (unlike the two dropdowns
// above, a fixed preset list alone wouldn't let you type an arbitrary size)
// plus a unit dropdown (px/em/rem/%/pt — app.ui.dropmenu, same as font-family/
// anti-aliasing) and a small flyout of common presets for one-click picking.
// The preset flyout reuses this file's own small CSS rather than
// app.ui.dropmenu, since it's not a value-list-only control (see
// textBarHTML's markup for this element).
function bindSizeCombo(barEl, node) {
    const wrap = barEl.querySelector('.designer-toolbar-size-combo');
    if (!wrap) return;
    const input = wrap.querySelector('[data-action="font-size"]');
    const arrowBtn = wrap.querySelector('[data-action="font-size-arrow"]');
    const optionsEl = wrap.querySelector('.designer-toolbar-size-options');
    const unitMount = barEl.querySelector('[data-mount="font-size-unit"]');

    const currentUnit = () => unitMount?.querySelector('.ui-dropmenu')?.value || 'px';

    if (app.ui?.dropmenu && unitMount) {
        const { unit } = parseFontSize(styleOf(node).fontSize);
        unitMount.innerHTML = app.ui.dropmenu({ options: FONT_SIZE_UNITS, selected: unit });
        app.ui.dropmenu.initAll();
        const unitEl = unitMount.querySelector('.ui-dropmenu');
        if (unitEl) {
            unitEl.style.height = '24px';
            unitEl.style.marginBottom = '0';
            unitEl.style.fontSize = '10px';
            unitEl.addEventListener('change', () => setFontSize(node, input?.value, unitEl.value));
        }
    }

    input?.addEventListener('change', e => setFontSize(node, e.target.value, currentUnit()));

    arrowBtn?.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = optionsEl?.classList.contains('open');
        document.querySelectorAll('.designer-toolbar-size-options.open').forEach(o => o.classList.remove('open'));
        if (!isOpen) optionsEl?.classList.add('open');
    });

    optionsEl?.querySelectorAll('.designer-toolbar-size-option').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            optionsEl.classList.remove('open');
            if (input) input.value = opt.dataset.value;
            setFontSize(node, opt.dataset.value, currentUnit());
        });
    });
}

function bindTextBar(barEl, node) {
    mountDropdowns(barEl, node);
    bindSizeCombo(barEl, node);
    barEl.querySelector('[data-action="align-left"]')?.addEventListener('click', () => setAlign(node, 'left'));
    barEl.querySelector('[data-action="align-center"]')?.addEventListener('click', () => setAlign(node, 'center'));
    barEl.querySelector('[data-action="align-right"]')?.addEventListener('click', () => setAlign(node, 'right'));
    mountColorSwatches(barEl, node);
}

const CURSOR_LINE_OPTIONS = [
    { value: 'none',   label: _('None') },
    { value: 'solid',  label: _('Solid') },
    { value: 'dashed', label: _('Dashed') },
    { value: 'dotted', label: _('Dotted') },
    { value: 'double', label: _('Double') }
];

const CURSOR_SIZE_UNITS = [
    { value: 'px',  label: 'px' },
    { value: 'em',  label: 'em' },
    { value: 'rem', label: 'rem' },
    { value: '%',   label: '%' },
    { value: 'pt',  label: 'pt' }
];

let widthHeightLinked = false;

function parseCursorSize(raw) {
    const m = /^(-?\d*\.?\d+)\s*([a-z%]*)$/i.exec(String(raw ?? '').trim());
    if (!m) return { number: '', unit: 'px' };
    return { number: m[1], unit: m[2] || 'px' };
}

function cursorBarHTML(node) {
    const style = node.style || {};
    const { number: wNumber } = parseCursorSize(node.layout?.width);
    const { number: hNumber } = parseCursorSize(node.layout?.height);
    const z = style.zIndex ?? '';
    const outlineOn = app.designer.selectTool?.outlineVisible?.() !== false;

    return (
        `<label class="designer-toolbar-outline-toggle" title="${_('Show selection outline')}">` +
            `<svg viewBox="0 0 16 16" width="14" height="14"><rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>` +
            `<input type="checkbox" data-action="toggle-outline" ${outlineOn ? 'checked' : ''}>` +
        `</label>` +
        `<span class="designer-toolbar-divider"></span>` +
        `<span class="designer-toolbar-fill-label">${_('Fill')}</span>` +
        `<span class="designer-toolbar-swatch-mount" data-mount="fill-color" title="${_('Fill color')}"></span>` +
        `<span class="designer-toolbar-divider"></span>` +
        `<span class="designer-toolbar-line-icon" title="${_('Line')}"><svg viewBox="0 0 16 16" width="14" height="14"><line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5"/></svg></span>` +
        `<span class="designer-toolbar-dropdown-mount designer-toolbar-line-mount" data-mount="line-style" title="${_('Line style')}"></span>` +
        `<span class="designer-toolbar-divider"></span>` +
        `<span class="designer-toolbar-dim-label">${_('B')}:</span>` +
        `<input type="number" class="designer-toolbar-dim-input" data-action="width" min="0" value="${wNumber}" placeholder="${_('auto')}">` +
        `<span class="designer-toolbar-dropdown-mount designer-toolbar-dim-unit-mount" data-mount="width-unit"></span>` +
        `<button type="button" class="designer-toolbar-link-btn${widthHeightLinked ? ' active' : ''}" data-action="toggle-link" title="${_('Lock aspect ratio')}">` +
            `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M6 8h4M5 5.5h1.5a2 2 0 0 1 0 4H5M11 10.5H9.5a2 2 0 0 1 0-4H11"/></svg>` +
        `</button>` +
        `<span class="designer-toolbar-dim-label">${_('H')}:</span>` +
        `<input type="number" class="designer-toolbar-dim-input" data-action="height" min="0" value="${hNumber}" placeholder="${_('auto')}">` +
        `<span class="designer-toolbar-dropdown-mount designer-toolbar-dim-unit-mount" data-mount="height-unit"></span>` +
        `<span class="designer-toolbar-divider"></span>` +
        `<span class="designer-toolbar-dim-label">${_('Z')}:</span>` +
        `<input type="number" class="designer-toolbar-dim-input designer-toolbar-zindex-input" data-action="zindex" value="${z}" placeholder="0">`
    );
}

function mountFillSwatch(barEl, node) {
    const mount = barEl.querySelector('[data-mount="fill-color"]');
    if (!mount) return;
    const swatch = app.designer.colorElement.create({
        color: node.style?.backgroundColor || 'rgba(0,0,0,0)', width: 18, height: 18,
        onClick: () => {
            app.designer.colorPicker.open({ color: node.style?.backgroundColor || '#ffffff' })
                .then(result => {
                    if (!result) return;
                    app.designer.style.setColor(node, 'backgroundColor', result);
                });
        }
    });
    mount.appendChild(swatch.el);
}

function mountLineDropdown(barEl, node) {
    if (!app.ui?.dropmenu) return;
    const mount = barEl.querySelector('[data-mount="line-style"]');
    if (!mount) return;
    mount.innerHTML = app.ui.dropmenu({ options: CURSOR_LINE_OPTIONS, selected: node.style?.borderStyle || 'none' });
    app.ui.dropmenu.initAll();
    const el = mount.querySelector('.ui-dropmenu');
    if (!el) return;
    el.style.height = '24px';
    el.style.marginBottom = '0';
    el.style.fontSize = '11px';
    el.addEventListener('change', () => {
        app.designer.style.setProperty(node, 'borderStyle', el.value === 'none' ? undefined : el.value, _('Changed line style'));
    });
}

function dimUnitOf(barEl, dim) {
    return barEl.querySelector(`[data-mount="${dim}-unit"] .ui-dropmenu`)?.value || 'px';
}

function mountDimUnitDropdown(barEl, dim, node) {
    if (!app.ui?.dropmenu) return;
    const mount = barEl.querySelector(`[data-mount="${dim}-unit"]`);
    if (!mount) return;
    const { unit } = parseCursorSize(node.layout?.[dim]);
    mount.innerHTML = app.ui.dropmenu({ options: CURSOR_SIZE_UNITS, selected: unit });
    app.ui.dropmenu.initAll();
    const el = mount.querySelector('.ui-dropmenu');
    if (!el) return;
    el.style.height = '24px';
    el.style.marginBottom = '0';
    el.style.fontSize = '10px';
    el.addEventListener('change', () => {
        const input = barEl.querySelector(`[data-action="${dim}"]`);
        if (input?.value !== '') commitDim(node, dim, input.value, el.value);
    });
}

// node.layout.width/height have no core/style.js setProperty equivalent —
// same do/undo/redo + win.history.execute shape designer_boxmodel_panel.js's
// own commitSize/tools/resize.js already use for these two fields
// (type: 'node.resize'), just driven by this bar's own inputs instead.
function commitDim(node, dim, raw, unit = 'px') {
    const n = parseFloat(raw);
    const after = (raw === '' || raw == null || Number.isNaN(n)) ? undefined : `${n}${unit}`;
    const before = node.layout?.[dim];
    if (after === before) return;

    const apply = (v) => {
        node.layout = node.layout || {};
        if (v === undefined) { const { [dim]: _omit, ...rest } = node.layout; node.layout = rest; }
        else node.layout[dim] = v;
        app.designer.render();
    };

    const title = _('Changed') + ' ' + (dim === 'width' ? _('width') : _('height'));
    const session = app.designer.win?.history;
    if (session) {
        session.execute({ type: 'node.resize', title, do: () => apply(after), undo: () => apply(before), redo: () => apply(after) });
    } else {
        apply(after);
    }
}

function elementPixelSize(node) {
    const el = document.querySelector(`#designerCanvasBody [data-node-id="${node.id}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
}

// Aspect lock reads the node's *current rendered* size (not just its two
// fields, which are often blank/"auto") to derive a ratio — same fallback
// designer_boxmodel_panel.js's own renderedDim() uses for display, applied
// here to actually compute the paired dimension.
function bindDimInputs(barEl, node) {
    mountDimUnitDropdown(barEl, 'width', node);
    mountDimUnitDropdown(barEl, 'height', node);

    const widthInput = barEl.querySelector('[data-action="width"]');
    const heightInput = barEl.querySelector('[data-action="height"]');

    widthInput?.addEventListener('change', e => {
        if (widthHeightLinked) {
            const size = elementPixelSize(node);
            const newWidth = parseFloat(e.target.value);
            if (size?.width > 0 && !Number.isNaN(newWidth)) {
                const newHeight = Math.round(newWidth * (size.height / size.width));
                if (heightInput) heightInput.value = newHeight;
                commitDim(node, 'height', String(newHeight), dimUnitOf(barEl, 'height'));
            }
        }
        commitDim(node, 'width', e.target.value, dimUnitOf(barEl, 'width'));
    });

    heightInput?.addEventListener('change', e => {
        if (widthHeightLinked) {
            const size = elementPixelSize(node);
            const newHeight = parseFloat(e.target.value);
            if (size?.height > 0 && !Number.isNaN(newHeight)) {
                const newWidth = Math.round(newHeight * (size.width / size.height));
                if (widthInput) widthInput.value = newWidth;
                commitDim(node, 'width', String(newWidth), dimUnitOf(barEl, 'width'));
            }
        }
        commitDim(node, 'height', e.target.value, dimUnitOf(barEl, 'height'));
    });
}

function bindCursorBar(barEl, node) {
    barEl.querySelector('[data-action="toggle-outline"]')?.addEventListener('change', e => {
        app.designer.selectTool?.setOutlineVisible?.(e.target.checked);
    });

    mountFillSwatch(barEl, node);
    mountLineDropdown(barEl, node);
    bindDimInputs(barEl, node);

    barEl.querySelector('[data-action="toggle-link"]')?.addEventListener('click', function () {
        widthHeightLinked = !widthHeightLinked;
        this.classList.toggle('active', widthHeightLinked);
    });

    barEl.querySelector('[data-action="zindex"]')?.addEventListener('change', e => {
        const raw = e.target.value;
        const n = parseInt(raw, 10);
        const value = (raw === '' || Number.isNaN(n)) ? undefined : String(n);
        app.designer.style.setProperty(node, 'zIndex', value, _('Changed z-index'));
    });
}

// ── Bar UI ──────────────────────────────────────────────────────────────

// Always present at the very start of the bar, regardless of tool/selection
// — purely a decorative marker for where the bar begins, not a control (per
// direct feedback: not clickable, no hover/active styling, no handler).
function homeButtonHTML() {
    return (
        `<span class="designer-toolbar-home-icon" title="${_('Designer')}"><svg><use href="#ic-designer-home"></use></svg></span>` +
        `<span class="designer-toolbar-divider"></span>`
    );
}

function barHTML() {
    return homeButtonHTML() + barContentHTML();
}

function barContentHTML() {
    const node = selectedNode();

    if (app.designer.activeTool === 'text' && (!node || node.type === 'text')) {
        return textBarHTML(node);
    }

    if (!node) {
        return `<span class="designer-toolbar-empty">${_('No component selected')}</span>`;
    }

    return cursorBarHTML(node);
}

function bindBar(barEl) {
    const node = selectedNode();
    if (app.designer.activeTool === 'text' && (!node || node.type === 'text')) {
        bindTextBar(barEl, node);
        return;
    }
    if (!node) return;

    bindCursorBar(barEl, node);
}

function render() {
    const bar = document.getElementById('designerToolbar');
    if (!bar) return;
    bar.innerHTML = barHTML();
    bindBar(bar);
}

function injectCSS() {
    if (document.getElementById('designer-toolbar-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-toolbar-style';
    style.textContent = `
        #designerToolbar { gap: 6px; padding: 0 8px; overflow: visible; }
        .designer-toolbar-empty { font-size: 11px; color: #fff; }
        .designer-toolbar-btn { font-size: 11px; background: rgba(0,0,0,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 3px; padding: 3px 6px; height: 24px; cursor: default; white-space: nowrap; }
        .designer-toolbar-btn:hover { background: var(--theme-backgruondcolorc, #00000040); }
        .designer-toolbar-btn:disabled { opacity: 0.35; cursor: default; }
        .designer-toolbar-btn:disabled:hover { background: rgba(0,0,0,0.15); }
        .designer-toolbar-btn-icon { width: 24px; padding: 0; flex-shrink: 0; }
        .designer-toolbar-btn.active, .designer-toolbar-btn-icon.active { background: var(--theme-backgruondcolorc, #00000040); }
        .designer-toolbar-btn-icon svg { width: 14px; height: 14px; }
        .designer-toolbar-swatch-mount { display: inline-flex; align-items: center; flex-shrink: 0; }
        .designer-toolbar-divider { width: 1px; height: 16px; background: rgba(255,255,255,0.15); flex-shrink: 0; }
        .designer-toolbar-home-icon { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0; opacity: 0.7; cursor: default; }
        .designer-toolbar-home-icon svg { width: 14px; height: 14px; }

        .designer-toolbar-dropdown-mount { display: inline-block; flex-shrink: 0; }
        .designer-toolbar-tag-mount { width: 100px; }
        .designer-toolbar-font-mount { width: 130px; }
        .designer-toolbar-weight-mount { width: 100px; }
        .designer-toolbar-unit-mount { width: 52px; }
        .designer-toolbar-antialias-mount { width: 90px; }
        .designer-toolbar-font-row { display: flex; align-items: center; gap: 8px; width: 100%; }
        .designer-toolbar-font-name { flex: 0 0 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.75; }
        .designer-toolbar-font-preview { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Font-size combo — editable input + unit dropdown + preset flyout. */
        .designer-toolbar-size-combo { position: relative; display: flex; align-items: center; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.15); border-radius: 3px; height: 24px; flex-shrink: 0; }
        .designer-toolbar-size-input { width: 38px; font-size: 11px; background: transparent; color: #fff; border: none; padding: 0 0 0 6px; height: 100%; box-sizing: border-box; }
        .designer-toolbar-size-input::-webkit-inner-spin-button,
        .designer-toolbar-size-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .designer-toolbar-size-input { -moz-appearance: textfield; }
        .designer-toolbar-size-arrow { background: none; border: none; border-left: 1px solid rgba(255,255,255,0.15); width: 16px; height: 100%; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; flex-shrink: 0; }
        .designer-toolbar-size-arrow:hover { background: var(--theme-backgruondcolorc, #00000040); }
        .designer-toolbar-size-options {
            display: none; position: absolute; top: calc(100% + 2px); left: 0; min-width: 100%; z-index: 2000;
            background: linear-gradient(144deg, rgba(37,37,37,0.97) 0%, rgba(10,10,10,0.95) 100%);
            backdrop-filter: blur(12px); border-radius: 5px;
            box-shadow: 1px 1px 6px rgba(0,0,0,0.5), 1px 1px 1px #ffffff1a, -1px -1px 1px #ffffff1a;
            padding: 3px 0; max-height: 180px; overflow-y: auto; box-sizing: border-box;
        }
        .designer-toolbar-size-options.open { display: block; }
        .designer-toolbar-size-option { padding: 5px 9px; cursor: default; color: #fff; font-size: 11px; white-space: nowrap; }
        .designer-toolbar-size-option:hover { background-color: rgba(255,255,255,0.1); }

        /* Cursor bar — outline toggle / fill / line / width-height / z-index. */
        .designer-toolbar-outline-toggle { display: flex; align-items: center; gap: 3px; flex-shrink: 0; cursor: pointer; color: rgba(255,255,255,0.75); }
        .designer-toolbar-outline-toggle input { width: 11px; height: 11px; margin: 0; cursor: pointer; }
        .designer-toolbar-fill-label { font-size: 11px; opacity: 0.75; flex-shrink: 0; }
        .designer-toolbar-line-icon { display: flex; align-items: center; opacity: 0.75; flex-shrink: 0; }
        .designer-toolbar-line-mount { width: 90px; }
        .designer-toolbar-dim-label { font-size: 11px; opacity: 0.6; flex-shrink: 0; }
        .designer-toolbar-dim-input {
            width: 44px; font-size: 11px; background: rgba(0,0,0,0.15); color: #fff;
            border: 1px solid rgba(255,255,255,0.15); border-radius: 3px; height: 24px; padding: 0 4px; box-sizing: border-box;
        }
        .designer-toolbar-dim-input::-webkit-inner-spin-button,
        .designer-toolbar-dim-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .designer-toolbar-dim-input { -moz-appearance: textfield; }
        .designer-toolbar-zindex-input { width: 40px; }
        .designer-toolbar-dim-unit-mount { width: 48px; flex-shrink: 0; }
        .designer-toolbar-link-btn {
            width: 20px; height: 24px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 3px; cursor: pointer; opacity: 0.7;
        }
        .designer-toolbar-link-btn:hover { opacity: 1; }
        .designer-toolbar-link-btn.active { opacity: 1; background: var(--theme-backgruondcolorc, #00000040); color: #4da3ff; }
    `;
    document.head.appendChild(style);
}

export function init(app) {
    if (!document.getElementById('designerToolbar')) return;

    injectCSS();
    loadDropmenuDep(app);

    render();

    app.designer._registerRenderHook(render);

    $(document).on('designer-selection-changed', render);

    $(document).on('designer-tool-changed', render);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.designer-toolbar-size-combo')) {
            document.querySelectorAll('.designer-toolbar-size-options.open').forEach(o => o.classList.remove('open'));
        }
    });
}
