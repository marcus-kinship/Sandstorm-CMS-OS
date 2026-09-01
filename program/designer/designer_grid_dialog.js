/**
 * @file designer/designer_grid_dialog.js
 * @description "Grid System" settings dialog — the shared panel behind both
 * the sidebar **View → Grid System** menu item and the Layers-panel
 * right-click "Grid System" item.
 *
 * A **Profile** picker at the top (Custom / 960.gs 12·16·24 …) fills the
 * column width + gap in one go; picking any value manually snaps the picker
 * back to "Custom". Below it, two sections COLUMNS and ROWS, each with a
 * show checkbox, then **gap** and **size** (column width / row height) — each
 * of those two a number input with **its own unit dropdown**
 * (`app.ui.dropmenu` — px / % / rem / em / vw·vh) — plus colour and opacity.
 *
 * Every control commits **immediately** — no OK/Cancel, matching every other
 * Designer style control. Changes go straight to `app.designer.grid`
 * (`setColumns` / `setRows` / `setProfile`), which re-paints the
 * `#designerGridOverlay` live and persists to `localStorage`. The dialog
 * holds no state of its own: it reads fresh from `app.designer.grid.getState()`
 * on open and after a profile is applied.
 *
 * Deliberately a **non-modal** floating window (plain `windowStart`, no
 * `app.windows.openDialog()`): the point of the live preview is to keep
 * editing the canvas with the panel open, which a modal lock-layer ("The
 * program is waiting for the user") would block. Lazy-loaded on first open
 * (see `designer_grid.js`'s `openDialog`) — not in `designer.js`'s boot
 * chain.
 *
 * @module program/designer/designer_grid_dialog
 */

const COLUMN_UNITS = [
    { value: 'px',  label: 'px' },
    { value: '%',   label: '%' },
    { value: 'rem', label: 'rem' },
    { value: 'em',  label: 'em' },
    { value: 'vw',  label: 'vw' }
];
const ROW_UNITS = [
    { value: 'px',  label: 'px' },
    { value: '%',   label: '%' },
    { value: 'rem', label: 'rem' },
    { value: 'em',  label: 'em' },
    { value: 'vh',  label: 'vh' }
];

// Per section: the four sub-fields, each with its own state key + unit key.
const SECTION_FIELDS = {
    columns: [
        { field: 'gap',   key: 'gap',   unitKey: 'gapUnit',   label: () => _('Gap'),          units: COLUMN_UNITS, min: 0 },
        { field: 'size',  key: 'width', unitKey: 'widthUnit', label: () => _('Column width'), units: COLUMN_UNITS, min: 1 }
    ],
    rows: [
        { field: 'gap',   key: 'gap',    unitKey: 'gapUnit',    label: () => _('Gap'),        units: ROW_UNITS, min: 0 },
        { field: 'size',  key: 'height', unitKey: 'heightUnit', label: () => _('Row height'), units: ROW_UNITS, min: 1 }
    ]
};

let _uiReady = null;

function loadUiDeps(app) {
    _uiReady = app.ui?.dropmenu
        ? Promise.resolve()
        : app.includeModule(app.config.local.ComponentsRoot + 'ui/dropmenu.js').then(mod => mod?.setup?.(app));
}

function injectCSS() {
    if (document.getElementById('designer-grid-dialog-style')) return;
    const style = document.createElement('style');
    style.id = 'designer-grid-dialog-style';
    style.textContent = `
        .dgd-root { display: flex; flex-direction: column; gap: 12px; padding: 14px; color: #fff; font-size: 11px; box-sizing: border-box; }
        .dgd-section { display: flex; flex-direction: column; gap: 8px; }
        .dgd-section-title { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.55; }
        .dgd-row { display: flex; align-items: center; gap: 8px; }
        .dgd-row-label { width: 92px; flex: 0 0 92px; opacity: 0.7; }
        .dgd-row input.def { width: 60px; flex: 0 0 60px; }
        .dgd-row .dgd-suffix { opacity: 0.5; }
        .dgd-row input[type="color"] { width: 40px; height: 22px; flex: 0 0 40px; padding: 0; border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; background: transparent; cursor: pointer; }
        .dgd-mount { flex: 1; min-width: 0; }
        .dgd-mount .ui-dropmenu { width: 100%; box-sizing: border-box; margin-bottom: 0; }
        .dgd-unit-mount { flex: 0 0 72px; }
        .dgd-check-row { display: flex; align-items: center; gap: 6px; }
        .dgd-check-row input { margin: 0; }
        .dgd-sep { height: 1px; background: rgba(255,255,255,0.1); }
    `;
    document.head.appendChild(style);
}

function toHex(c) {
    const s = String(c || '#FF0000').trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s;
    if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + s.slice(1).split('').map(x => x + x).join('');
    return '#FF0000';
}

function fieldRowHTML(kind, spec, s) {
    const p = 'dgd-' + kind + '-' + spec.field;
    return `
        <div class="dgd-row">
            <span class="dgd-row-label">${spec.label()}</span>
            <input type="number" class="def ${p}" min="${spec.min}" value="${s[spec.key]}">
            <span class="dgd-mount dgd-unit-mount" data-unit-mount="${kind}-${spec.field}"></span>
        </div>
    `;
}

function sectionHTML(kind, s) {
    const p = 'dgd-' + kind;
    return `
        <div class="dgd-section" data-section="${kind}">
            <span class="dgd-section-title">${kind === 'columns' ? _('Columns') : _('Rows')}</span>
            <label class="dgd-check-row">
                <input type="checkbox" class="${p}-show" ${s.show ? 'checked' : ''}>
                <span>${kind === 'columns' ? _('Show columns') : _('Show rows')}</span>
            </label>
            ${SECTION_FIELDS[kind].map(spec => fieldRowHTML(kind, spec, s)).join('')}
            <div class="dgd-row">
                <span class="dgd-row-label">${_('Color')}</span>
                <input type="color" class="${p}-color" value="${toHex(s.color)}">
            </div>
            <div class="dgd-row">
                <span class="dgd-row-label">${_('Opacity')}</span>
                <input type="number" class="def ${p}-opacity" min="0" max="100" value="${s.opacity}">
                <span class="dgd-suffix">%</span>
            </div>
        </div>
    `;
}

function renderHTML(state) {
    return `
        <div class="dgd-root">
            <div class="dgd-row">
                <span class="dgd-row-label">${_('Profile')}</span>
                <span class="dgd-mount" data-profile-mount></span>
            </div>
            <div class="dgd-sep"></div>
            ${sectionHTML('columns', state.columns)}
            <div class="dgd-sep"></div>
            ${sectionHTML('rows', state.rows)}
        </div>
    `;
}

function wireDialog(root) {
    const num = v => { const n = parseFloat(v); return Number.isNaN(n) ? undefined : n; };

    // ── Profile picker ───────────────────────────────────────────────────
    const profileMount = root.querySelector('[data-profile-mount]');
    profileMount.innerHTML = app.ui.dropmenu({
        options: app.designer.grid.getProfiles(),
        selected: app.designer.grid.getState().profile
    });

    // ── Per-field unit pickers ──────────────────────────────────────────
    const s0 = app.designer.grid.getState();
    ['columns', 'rows'].forEach(kind => {
        SECTION_FIELDS[kind].forEach(spec => {
            root.querySelector(`[data-unit-mount="${kind}-${spec.field}"]`).innerHTML =
                app.ui.dropmenu({ options: spec.units, selected: s0[kind][spec.unitKey] });
        });
    });

    app.ui.dropmenu.initAll();

    const profileEl = profileMount.querySelector('.ui-dropmenu');
    const unitEl = (kind, field) => root.querySelector(`[data-unit-mount="${kind}-${field}"] .ui-dropmenu`);

    // Re-read every field straight off the model — used after a profile apply
    // (which changes width/gap/units without any user input event firing).
    function syncInputs() {
        const s = app.designer.grid.getState();
        profileEl.value = s.profile;
        ['columns', 'rows'].forEach(kind => {
            root.querySelector('.dgd-' + kind + '-show').checked = !!s[kind].show;
            root.querySelector('.dgd-' + kind + '-color').value = toHex(s[kind].color);
            root.querySelector('.dgd-' + kind + '-opacity').value = s[kind].opacity;
            SECTION_FIELDS[kind].forEach(spec => {
                root.querySelector('.dgd-' + kind + '-' + spec.field).value = s[kind][spec.key];
                unitEl(kind, spec.field).value = s[kind][spec.unitKey];
            });
        });
    }

    profileEl.addEventListener('change', () => {
        app.designer.grid.setProfile(profileEl.value);
        syncInputs();
    });

    // ── Section fields ──────────────────────────────────────────────────
    function bindSection(kind, apply) {
        const p = '.dgd-' + kind;
        const markCustom = () => { profileEl.value = 'custom'; };

        root.querySelector(p + '-show').addEventListener('change', function () {
            apply({ show: this.checked });
        });

        SECTION_FIELDS[kind].forEach(spec => {
            const input = root.querySelector(p + '-' + spec.field);
            const uEl = unitEl(kind, spec.field);
            input.addEventListener('input', () => {
                const v = num(input.value);
                if (v !== undefined) { apply({ [spec.key]: Math.max(spec.min, v) }); markCustom(); }
            });
            uEl.addEventListener('change', () => { apply({ [spec.unitKey]: uEl.value }); markCustom(); });
        });

        const color = root.querySelector(p + '-color');
        color.addEventListener('input', () => { apply({ color: color.value }); markCustom(); });

        const opacity = root.querySelector(p + '-opacity');
        opacity.addEventListener('input', () => {
            const v = num(opacity.value);
            if (v !== undefined) { apply({ opacity: Math.max(0, Math.min(100, v)) }); markCustom(); }
        });
    }

    bindSection('columns', partial => app.designer.grid.setColumns(partial));
    bindSection('rows', partial => app.designer.grid.setRows(partial));
}

function open() {
    return _uiReady.then(() => {
        injectCSS();

        // Non-modal on purpose (see file header). If one is already open, focus it.
        const existing = document.querySelector('.window.pid-designer .dgd-root');
        if (existing) {
            const winEl = existing.closest('.window');
            if (winEl) { app.setActiveWindow?.(winEl.id.replace(/-win$/, '')); return; }
        }

        app.ui.windowStart('designer', {
            id: 'designer',
            title: _('Grid System'),
            windowIcon: true,
            resizable: false,
            width: '340px',
            height: '540px',
            body(windowobj) {
                const dialogId = windowobj.windowId;

                setTimeout(() => {
                    const winEl = windowobj.el?.[0] ?? document.getElementById(dialogId + '-win');
                    const root = winEl?.querySelector('.dgd-root');
                    if (!root) return;
                    wireDialog(root);
                }, 0);

                return renderHTML(app.designer.grid.getState());
            }
        });
    });
}

export function init(app) {
    injectCSS();
    loadUiDeps(app);
    app.designer = app.designer || {};
    app.designer.gridDialog = { open };
}
