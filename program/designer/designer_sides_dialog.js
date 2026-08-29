/**
 * @file designer/designer_sides_dialog.js
 * @description Small "edit all four sides" window for a linked box-model
 * group (Margin or Padding) — opened from designer_groups_panel.js's Box
 * tab via the grid-icon button next to that group's linked field. Four
 * plain number inputs (Top/Right/Bottom/Left), **each with its own unit
 * dropdown** (per direct feedback — an earlier pass shared one dropdown
 * across all four, which couldn't express e.g. "10px top, 2% left");
 * pressing Enter in *any* field — or clicking Apply — reads all four
 * current input+unit pairs together and commits them in a single
 * `setProperties()` call, one combined undo step, per direct feedback
 * ("ändrar på alla fyra fält med enter"). Deliberately does **not** also
 * commit on a field's own blur/change — that would spam one history entry
 * per field tabbed through, defeating the point of a single combined edit.
 *
 * Reusable across both groups: `open({node, key})` where `key` is
 * `'margin'`/`'padding'`, mapping to the exact same `PROP_OF` shape
 * designer_groups_panel.js's own `BOX_PROP_OF` uses (independent copy, this
 * program's convention for small per-file constant tables).
 *
 * Dialog lifecycle is the exact `_pending`/`windowStart`/`state.close`/two-
 * `setTimeout` skeleton `designer_border_dialog.js`/`designer_animation_
 * dialog.js` both already use.
 *
 * Lazy-loaded on first click only (see designer_groups_panel.js's
 * `openSidesDialogFor`) — not part of `designer.js`'s boot chain.
 *
 * @module program/designer/designer_sides_dialog
 */

const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
const PROP_OF = { margin: s => `margin${s}`, padding: s => `padding${s}` };
const TITLE_OF = { margin: () => _('Margin'), padding: () => _('Padding') };

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

let _pending = null;
let _uiReady = null;

function loadUiDeps(app) {
    _uiReady = app.ui?.dropmenu
        ? Promise.resolve()
        : app.includeModule(app.config.local.ComponentsRoot + 'ui/dropmenu.js').then(mod => mod?.setup?.(app));
}

// One {number, unit} pair per side, in SIDES order — independent per side
// now, not shared.
function readState(node, key) {
    const propOf = PROP_OF[key];
    return SIDES.map(side => parseSize(node.style?.[propOf(side)]));
}

function renderHTML(state) {
    return `
        <div class="dsd-root">
            <div class="dsd-grid">
                ${SIDES.map((side, i) =>
                    `<div class="dsd-field">` +
                        `<span>${_(side)}</span>` +
                        `<div class="dsd-field-row">` +
                            `<input type="number" class="def dsd-input" data-side="${side}" value="${state[i].number}" placeholder="0">` +
                            `<span class="dsd-unit-mount" data-unit-mount="${side}" data-unit="${state[i].unit}"></span>` +
                        `</div>` +
                    `</div>`
                ).join('')}
            </div>
            <div class="dsd-footer">
                <button type="button" class="aero-button xs dsd-apply">${_('Apply')}</button>
                <button type="button" class="aero-button xs dsd-close">${_('Close')}</button>
            </div>
        </div>
    `;
}

function wireDialog(root, node, key, { close }) {
    const propOf = PROP_OF[key];

    // Reads all four current input+unit pairs together and commits them as
    // one combined undo step, regardless of which single field triggered it.
    function commit() {
        const propsMap = {};
        SIDES.forEach(side => {
            const input = root.querySelector(`.dsd-input[data-side="${side}"]`);
            const unit = root.querySelector(`[data-unit-mount="${side}"] .ui-dropmenu`)?.value || 'px';
            const raw = input?.value;
            const n = parseFloat(raw);
            propsMap[propOf(side)] = (raw === '' || raw == null || Number.isNaN(n)) ? undefined : `${n}${unit}`;
        });
        app.designer.style.setProperties(node, propsMap, _('Changed') + ' ' + TITLE_OF[key]());
    }

    if (app.ui?.dropmenu) {
        SIDES.forEach(side => {
            const mount = root.querySelector(`[data-unit-mount="${side}"]`);
            if (mount) mount.innerHTML = app.ui.dropmenu({ options: SIZE_UNITS, selected: mount.dataset.unit || 'px' });
        });
        app.ui.dropmenu.initAll();
        SIDES.forEach(side => {
            const el = root.querySelector(`[data-unit-mount="${side}"] .ui-dropmenu`);
            if (!el) return;
            el.style.height = '20px';
            el.style.marginBottom = '0';
            el.style.fontSize = '9px';
            el.addEventListener('change', commit);
        });
    }

    root.querySelectorAll('.dsd-input').forEach(input => {
        input.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            commit();
        });
    });

    root.querySelector('.dsd-apply')?.addEventListener('click', commit);
    root.querySelector('.dsd-close')?.addEventListener('click', () => close());
}

function injectCSS() {
    if (document.getElementById('designer-sides-dialog-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-sides-dialog-style';
    style.textContent = `
        .dsd-root { display: flex; flex-direction: column; gap: 12px; padding: 14px; color: #fff; font-size: 11px; }
        .dsd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 10px; }
        .dsd-field { display: flex; flex-direction: column; gap: 3px; }
        .dsd-field > span { opacity: 0.6; font-size: 10px; text-transform: uppercase; }
        .dsd-field-row { display: flex; gap: 4px; }
        .dsd-field input.def { width: 56px; flex: 0 0 56px; box-sizing: border-box; }
        .dsd-unit-mount { flex: 1; min-width: 0; }
        .dsd-unit-mount .ui-dropmenu { width: 100%; box-sizing: border-box; }
        .dsd-footer { display: flex; justify-content: flex-end; gap: 6px; }
    `;
    document.head.appendChild(style);
}

function open(options = {}) {
    return _uiReady.then(() => {
        _pending = { options };

        app.ui.windowStart('designer', {
            id: 'designer',
            title: TITLE_OF[options.key]?.() || _('Edit sides'),
            windowIcon: true,
            resizable: false,
            width: '300px',
            height: '220px',
            body(windowobj) {
                const captured = _pending;
                _pending = null;
                if (!captured || !captured.options.node || !captured.options.key) return '';

                const node = captured.options.node;
                const key = captured.options.key;
                const parentId = captured.options.parentId || app.designer.win?.windowId || 'designer';
                const dialogId = windowobj.windowId;

                windowobj.state.close(() => {
                    if (parentId) app.windows.closeDialog(dialogId);
                });

                setTimeout(() => {
                    app.windows.openDialog({ parentId, dialogId, modal: true, dialogTitle: TITLE_OF[key]() });
                }, 0);

                setTimeout(() => {
                    const winEl = windowobj.el?.[0] ?? document.getElementById(dialogId + '-win');
                    const root = winEl?.querySelector('.dsd-root');
                    if (!root) return;
                    wireDialog(root, node, key, { close: () => windowobj.close() });
                    root.querySelector('.dsd-input')?.focus();
                }, 0);

                return renderHTML(readState(node, key));
            }
        });
    });
}

export function init(app) {
    injectCSS();
    app.designer = app.designer || {};
    app.designer.sidesDialog = { open };

    loadUiDeps(app);
}
