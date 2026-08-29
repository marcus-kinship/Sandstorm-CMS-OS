/**
 * @file designer/designer_border_dialog.js
 * @description "Border" editor dialog, opened from the Properties panel's
 * Border row (`designer_boxmodel_panel.js`'s `openBorderDialog`) — edits
 * everything that row's own width fields don't: border-style, border-color,
 * a unit-aware width (the panel's own field is always px), and an optional
 * 2-stop linear-gradient border (`border-image`, since `border-color` can't
 * hold a gradient). Every control commits immediately via `core/style.js`'s
 * `setProperty`/`setProperties` — no OK/Cancel, matching every other
 * Designer style control's philosophy (one field, one undo step).
 *
 * Dialog lifecycle is the exact `_pending`/`windowStart`/`state.close`/two-
 * `setTimeout` skeleton `designer_color_picker_window.js`'s `open()` uses,
 * minus the Promise/resolve plumbing — this dialog never returns a value,
 * so there's nothing to resolve, just a way to close.
 *
 * Solid vs. Gradient uses two independent `app.designer.colorElement`
 * swatches (not `colorGroup`) for the gradient's two stops — `colorGroup`
 * composes a primary/secondary pair but gives no way to tell its two
 * internal swatches apart from the `designer-color-changed` event alone (no
 * `id` is passed to either), so distinguishing "primary changed" from
 * "secondary changed" would mean guessing from a global document event
 * instead of a direct callback. Two plain `colorElement.create({onClick})`
 * swatches give each stop its own explicit commit path — still the same
 * underlying swatch/color-picker primitive, just not the composed widget.
 *
 * Mode detection on open is intentionally strict: `GRADIENT_RE` only
 * recognizes a `borderImage` that's *exactly* what this file's own
 * `buildGradientCss` produces. Anything else (hand-authored CSS, a
 * differently-shaped gradient, unset) opens in Solid mode reading
 * `borderColor` — this dialog never tries to parse arbitrary border-image
 * CSS it can't actually edit.
 *
 * Holds no state of its own across opens/closes — every `open({node})` call
 * reads fresh straight off `node.style`; `node.style` stays the single
 * source of truth, so dialog state can never drift from what's rendered.
 *
 * Lazy-loaded on first click only (see `designer_boxmodel_panel.js`'s
 * `openBorderDialog`) — not part of `designer.js`'s boot chain.
 *
 * @module program/designer/designer_border_dialog
 */

import { normalizeColor, serializeColor } from './core/color.js';

const SIDES = ['Top', 'Right', 'Bottom', 'Left'];

const BORDER_STYLE_OPTIONS = [
    { value: 'none',   label: _('None') },
    { value: 'solid',  label: _('Solid') },
    { value: 'dashed', label: _('Dashed') },
    { value: 'dotted', label: _('Dotted') },
    { value: 'double', label: _('Double') },
    { value: 'groove', label: _('Groove') },
    { value: 'ridge',  label: _('Ridge') },
    { value: 'inset',  label: _('Inset') },
    { value: 'outset', label: _('Outset') }
];

const BORDER_WIDTH_UNITS = [
    { value: 'px',  label: 'px' },
    { value: 'em',  label: 'em' },
    { value: 'rem', label: 'rem' },
    { value: 'pt',  label: 'pt' }
];

function parseSize(raw) {
    const m = /^(-?\d*\.?\d+)\s*([a-z%]*)$/i.exec(String(raw ?? '').trim());
    if (!m) return { number: '', unit: 'px' };
    return { number: m[1], unit: m[2] || 'px' };
}

// The single place a gradient border string is ever built — both the real
// commit (setProperty('borderImage', ...)) and the dialog's own live
// preview call this, so they can never drift into two representations.
function buildGradientCss(angleDeg, primary, secondary) {
    return `linear-gradient(${angleDeg}deg, ${serializeColor(primary)}, ${serializeColor(secondary)}) 1`;
}

const COLOR_TOKEN = '(#[0-9a-f]{6}|rgba?\\(\\d{1,3}, \\d{1,3}, \\d{1,3}(?:, [\\d.]+)?\\))';
const GRADIENT_RE = new RegExp(`^linear-gradient\\((\\d{1,3})deg, ${COLOR_TOKEN}, ${COLOR_TOKEN}\\) 1$`);

let _pending = null;
let _uiReady = null;

function loadUiDeps(app) {
    _uiReady = app.ui?.dropmenu
        ? Promise.resolve()
        : app.includeModule(app.config.local.ComponentsRoot + 'ui/dropmenu.js').then(mod => mod?.setup?.(app));
}

// ── Read node.style fresh — no persisted dialog state ──────────────────────

function readState(node) {
    const style = node.style || {};
    const { number, unit } = parseSize(style.borderTopWidth);
    const borderStyle = style.borderStyle || 'solid';
    const solidColor = normalizeColor(style.borderColor ?? '#000000');

    const gm = typeof style.borderImage === 'string' ? GRADIENT_RE.exec(style.borderImage) : null;
    if (gm) {
        return {
            width: number, unit, borderStyle,
            mode: 'gradient', angle: parseInt(gm[1], 10),
            primary: normalizeColor(gm[2]), secondary: normalizeColor(gm[3]),
            solidColor
        };
    }
    return {
        width: number, unit, borderStyle,
        mode: 'solid', angle: 90,
        primary: normalizeColor('#000000'), secondary: normalizeColor('#ffffff'),
        solidColor
    };
}

// ── Markup ───────────────────────────────────────────────────────────────

function renderHTML(state) {
    return `
        <div class="dbd-root">
            <div class="dbd-row">
                <span class="dbd-row-label">${_('Width')}</span>
                <input type="number" class="def dbd-width" value="${state.width}" min="0" placeholder="0">
                <span class="dbd-unit-mount" data-unit-mount></span>
            </div>
            <div class="dbd-row">
                <span class="dbd-row-label">${_('Style')}</span>
                <span class="dbd-style-mount" data-style-mount></span>
            </div>
            <div class="dbd-row">
                <span class="dbd-row-label">${_('Color')}</span>
                <div class="dbd-mode-toggle">
                    <button type="button" class="dbd-mode-btn${state.mode === 'solid' ? ' active' : ''}" data-mode="solid">${_('Solid')}</button>
                    <button type="button" class="dbd-mode-btn${state.mode === 'gradient' ? ' active' : ''}" data-mode="gradient">${_('Gradient')}</button>
                </div>
            </div>
            <div class="dbd-color-area" data-color-area></div>
            <div class="dbd-preview-wrap">
                <div class="dbd-preview" data-preview></div>
            </div>
            <div class="dbd-footer">
                <button type="button" class="aero-button xs dbd-close">${_('Close')}</button>
            </div>
        </div>
    `;
}

// ── Dialog wiring ────────────────────────────────────────────────────────

function wireDialog(root, node, dialogId, parentId, { close }) {
    const state = readState(node);

    const widthInput  = root.querySelector('.dbd-width');
    const unitMount    = root.querySelector('[data-unit-mount]');
    const styleMount   = root.querySelector('[data-style-mount]');
    const colorArea    = root.querySelector('[data-color-area]');
    const preview      = root.querySelector('[data-preview]');
    const modeButtons  = root.querySelectorAll('.dbd-mode-btn');

    unitMount.innerHTML = app.ui.dropmenu({ options: BORDER_WIDTH_UNITS, selected: state.unit });
    styleMount.innerHTML = app.ui.dropmenu({ options: BORDER_STYLE_OPTIONS, selected: state.borderStyle });
    app.ui.dropmenu.initAll();
    const unitEl  = unitMount.querySelector('.ui-dropmenu');
    const styleEl = styleMount.querySelector('.ui-dropmenu');

    function updateStyleDropdownEnabled() {
        const disabled = state.mode === 'gradient';
        styleMount.classList.toggle('dbd-disabled', disabled);
        let hint = root.querySelector('.dbd-style-hint');
        if (disabled && !hint) {
            hint = document.createElement('div');
            hint.className = 'dbd-style-hint';
            hint.textContent = _('Gradient borders require a solid border style');
            styleMount.parentElement.appendChild(hint);
        } else if (!disabled && hint) {
            hint.remove();
        }
    }

    function updatePreview() {
        const w = (widthInput.value || '0') + (unitEl.value || 'px');
        preview.style.borderWidth = w;
        if (state.mode === 'gradient') {
            preview.style.borderStyle = 'solid';
            preview.style.borderColor = 'transparent';
            preview.style.borderImage = buildGradientCss(state.angle, state.primary, state.secondary);
        } else {
            preview.style.borderImage = '';
            preview.style.borderStyle = styleEl.value;
            preview.style.borderColor = serializeColor(state.solidColor);
        }
    }

    function commitWidth() {
        const raw = widthInput.value;
        const n = parseFloat(raw);
        const unit = unitEl.value || 'px';
        const value = (raw === '' || Number.isNaN(n)) ? undefined : `${n}${unit}`;
        const propsMap = Object.fromEntries(SIDES.map(side => [`border${side}Width`, value]));
        app.designer.style.setProperties(node, propsMap, _('Changed') + ' ' + _('border width'));
    }

    function commitStyle() {
        if (state.mode === 'gradient') return; // dropdown is disabled in this mode; guard anyway
        state.borderStyle = styleEl.value;
        app.designer.style.setProperty(node, 'borderStyle', state.borderStyle, _('Changed border style'));
        updatePreview();
    }

    function commitSolid() {
        app.designer.style.setProperty(node, 'borderColor', serializeColor(state.solidColor), _('Changed border color'));
        updatePreview();
    }

    function commitGradient() {
        const css = buildGradientCss(state.angle, state.primary, state.secondary);
        app.designer.style.setProperty(node, 'borderImage', css, _('Changed border gradient'));
        updatePreview();
    }

    // window-modal.js's openDialog() explicitly rejects dialog-hosts-dialog
    // ("dialogs cannot host dialogs") — opening the color picker with this
    // border dialog itself as parentId silently fails that validation (the
    // picker window still gets created, but its modal lock-layer never
    // activates, so it renders without being properly brought above this
    // dialog and pointer events go to the wrong window). Since this system
    // only supports one level of dialog nesting, work within that: decouple
    // this dialog from its own modal lock first (closeDialog does NOT close
    // the window, only the parent/dialog coupling — see its own doc
    // comment), open the picker as a dialog of the SAME parent this dialog
    // itself is coupled to, then re-couple this dialog once the picker
    // resolves either way.
    function openColorPicker(color) {
        app.windows.closeDialog(dialogId);
        return app.designer.colorPicker.open({ color, parentId }).finally(() => {
            app.windows.openDialog({ parentId, dialogId, modal: true, dialogTitle: _('Border') });
        });
    }

    function renderColorArea() {
        colorArea.innerHTML = '';

        if (state.mode === 'solid') {
            const swatch = app.designer.colorElement.create({
                color: serializeColor(state.solidColor),
                onClick: () => {
                    openColorPicker(state.solidColor).then(result => {
                        if (!result) return;
                        state.solidColor = normalizeColor(result);
                        swatch.setColor(state.solidColor);
                        commitSolid();
                    });
                }
            });
            colorArea.appendChild(swatch.el);
        } else {
            const row = document.createElement('div');
            row.className = 'dbd-gradient-swatches';

            const primarySwatch = app.designer.colorElement.create({
                color: serializeColor(state.primary),
                onClick: () => {
                    openColorPicker(state.primary).then(result => {
                        if (!result) return;
                        state.primary = normalizeColor(result);
                        primarySwatch.setColor(state.primary);
                        commitGradient();
                    });
                }
            });
            const secondarySwatch = app.designer.colorElement.create({
                color: serializeColor(state.secondary),
                onClick: () => {
                    openColorPicker(state.secondary).then(result => {
                        if (!result) return;
                        state.secondary = normalizeColor(result);
                        secondarySwatch.setColor(state.secondary);
                        commitGradient();
                    });
                }
            });
            row.append(primarySwatch.el, secondarySwatch.el);
            colorArea.appendChild(row);

            const angleWrap = document.createElement('label');
            angleWrap.className = 'dbd-angle-wrap';
            angleWrap.innerHTML = `<span>${_('Angle')}</span>`;
            const angleInput = document.createElement('input');
            angleInput.type = 'number';
            angleInput.className = 'def dbd-angle';
            angleInput.min = '0';
            angleInput.max = '360';
            angleInput.step = '1';
            angleInput.value = state.angle;
            angleInput.addEventListener('input', () => {
                state.angle = parseInt(angleInput.value, 10) || 0;
                updatePreview();
            });
            angleInput.addEventListener('change', commitGradient);
            angleWrap.appendChild(angleInput);
            colorArea.appendChild(angleWrap);
        }

        updatePreview();
    }

    function switchMode(newMode) {
        if (newMode === state.mode) return;
        state.mode = newMode;

        if (newMode === 'gradient') {
            app.designer.style.setProperties(node, {
                borderStyle: 'solid',
                borderColor: 'transparent',
                borderImage: buildGradientCss(state.angle, state.primary, state.secondary)
            }, _('Changed border to gradient'));
        } else {
            app.designer.style.setProperties(node, {
                borderImage: undefined,
                borderColor: serializeColor(state.solidColor)
            }, _('Changed border to solid'));
        }

        modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === newMode));
        updateStyleDropdownEnabled();
        renderColorArea();
    }

    widthInput.addEventListener('input', updatePreview);
    widthInput.addEventListener('change', commitWidth);
    unitEl.addEventListener('change', () => { updatePreview(); commitWidth(); });
    styleEl.addEventListener('change', commitStyle);
    modeButtons.forEach(btn => btn.addEventListener('click', () => switchMode(btn.dataset.mode)));
    root.querySelector('.dbd-close').addEventListener('click', () => close());

    updateStyleDropdownEnabled();
    renderColorArea();
}

function injectCSS() {
    if (document.getElementById('designer-border-dialog-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-border-dialog-style';
    style.textContent = `
        .dbd-root { display: flex; flex-direction: column; gap: 12px; padding: 14px; color: #fff; font-size: 11px; }
        .dbd-row { display: flex; align-items: center; gap: 8px; }
        .dbd-row-label { width: 50px; flex: 0 0 50px; opacity: 0.7; }
        input.dbd-width { width: 70px; flex: 0 0 70px; }
        .dbd-unit-mount, .dbd-style-mount { flex: 1; min-width: 0; }
        .dbd-unit-mount .ui-dropmenu, .dbd-style-mount .ui-dropmenu { width: 100%; box-sizing: border-box; }
        .dbd-disabled { pointer-events: none; opacity: 0.4; }
        .dbd-style-hint { font-size: 10px; opacity: 0.6; margin: -6px 0 0 58px; font-style: italic; }

        .dbd-mode-toggle { display: flex; gap: 4px; }
        .dbd-mode-btn {
            flex: 1; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.15);
            border-radius: 3px; font-size: 11px; padding: 5px 0; cursor: pointer;
        }
        .dbd-mode-btn:hover { background: rgba(255,255,255,0.1); }
        .dbd-mode-btn.active { background: #4da3ff; border-color: #4da3ff; }

        .dbd-color-area { display: flex; align-items: center; gap: 10px; min-height: 32px; }
        .dbd-gradient-swatches { display: flex; gap: 8px; }
        .dbd-angle-wrap { display: flex; align-items: center; gap: 6px; font-size: 10px; opacity: 0.8; }
        input.dbd-angle { width: 56px; flex: 0 0 56px; }

        .dbd-preview-wrap { display: flex; justify-content: center; padding: 10px 0; background: rgba(0,0,0,0.15); border-radius: 4px; }
        .dbd-preview { width: 120px; height: 60px; border-width: 10px; border-style: solid; border-color: #000; background: rgba(255,255,255,0.06); box-sizing: border-box; }

        .dbd-footer { display: flex; justify-content: flex-end; }
    `;
    document.head.appendChild(style);
}

function open(options = {}) {
    return _uiReady.then(() => {
        _pending = { options };

        app.ui.windowStart('designer', {
            id: 'designer',
            title: _('Border'),
            windowIcon: true,
            resizable: false,
            width: '400px',
            height: '390px',
            body(windowobj) {
                const captured = _pending;
                _pending = null;
                if (!captured || !captured.options.node) return '';

                const node = captured.options.node;
                const parentId = captured.options.parentId || app.designer.win?.windowId || 'designer';
                const dialogId = windowobj.windowId;

                windowobj.state.close(() => {
                    if (parentId) app.windows.closeDialog(dialogId);
                });

                setTimeout(() => {
                    app.windows.openDialog({ parentId, dialogId, modal: true, dialogTitle: _('Border') });
                }, 0);

                setTimeout(() => {
                    const winEl = windowobj.el?.[0] ?? document.getElementById(dialogId + '-win');
                    const root = winEl?.querySelector('.dbd-root');
                    if (!root) return;
                    wireDialog(root, node, dialogId, parentId, { close: () => windowobj.close() });
                }, 0);

                return renderHTML(readState(node));
            }
        });
    });
}

export function init(app) {
    injectCSS();
    app.designer = app.designer || {};
    app.designer.borderDialog = { open };

    loadUiDeps(app);
}
