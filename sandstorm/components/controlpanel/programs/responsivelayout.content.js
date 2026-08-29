/**
 * @file controlpanel/programs/responsivelayout.content.js
 * @description "Responsive Window Layout" panel content — lazy-loaded on
 * first open via `responsivelayout.js`'s `panel.contentPath`.
 *
 * Never grows a position/size editor — layout editing always happens by
 * dragging/resizing the actual windows on the desktop (already works). This
 * panel only ever saves/restores/selects-default/administers a snapshot of
 * whatever arrangement is currently on screen, entirely through
 * `app.responsiveLayout.api` (never touches `app.config` directly — see that
 * module's own header comment for why).
 *
 * Rendered via the same `os.ui.body(layout).render()` block-tree DSL +
 * `app.ui.label(text, forId, field)` two-column row convention every other
 * Control Panel tab uses (see cursor.js/notifications.js) — label fixed at
 * 140px on the left, the field/value at 300px on the right (`.ui-label-row`
 * in `sandstorm/components/ui/dropmenu.js`), not a bespoke layout.
 *
 * @module components/controlpanel/programs/responsivelayout.content
 */

const _CSS = `
.rwl-status { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; margin: 4px 0; }
.rwl-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.rwl-dot-active { background: #3ddc84; }
.rwl-dot-off { background: rgba(255,255,255,0.35); }
.rwl-dot-warn { background: #ffc107; }
.rwl-reason { opacity: 0.75; font-size: 12px; margin: 0 0 10px; }
.rwl-value { font-size: 13px; color: var(--theme-fontcolor); }
.rwl-note { font-size: 12px; opacity: 0.6; font-style: italic; margin: 6px 0; }
.rwl-errors { list-style: none; margin: 6px 0; padding: 0; }
.rwl-errors li { font-size: 12px; color: #ff8a80; padding: 2px 0; }
.rwl-errors li::before { content: "\\26a0 "; }
.rwl-actions { display: flex; align-items: center; gap: 10px; padding-top: 4px; }
.rwl-bp-input { width: 90px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 3px; padding: 5px 8px; font-size: 12px; vertical-align: middle; }
.rwl-bp-warn { color: #ffc107; font-size: 11px; margin: 4px 0; }
.rwl-desc { font-size: 12px; opacity: 0.7; line-height: 1.5; margin: 0; }
.rwl-col-field { display: inline-flex; align-items: center; gap: 6px; margin-left: 16px; vertical-align: middle; }
.rwl-col-label { font-size: 11px; opacity: 0.6; }
.rwl-col-input { width: 48px; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 3px; padding: 5px 6px; font-size: 12px; }
.rwl-col-input:disabled { opacity: 0.4; }
.switch-def-sm { transform: scale(0.7); transform-origin: left center; }
.rwl-preview-off { margin: 4px 0 0; padding: 8px; background: rgba(0,0,0,0.1); border-radius: 4px; }
.rwl-preview { display: grid; gap: 6px; padding: 8px; background: rgba(0,0,0,0.15); border-radius: 4px; margin: 4px 0 0; }
.rwl-fake-win { height: 34px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; position: relative; overflow: hidden; }
.rwl-fake-win::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 8px; background: rgba(255,255,255,0.25); }
.rwl-user-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 12px; }
.rwl-user-row .rwl-user-name { font-weight: 600; }
.rwl-user-row .rwl-user-source { opacity: 0.65; }
.rwl-checklist { list-style: none; margin: 8px 0; padding: 0; font-size: 12px; }
.rwl-checklist li { padding: 2px 0; opacity: 0.85; }
.rwl-checklist li::before { content: "\\2713 "; color: #3ddc84; }
#rwl-enable-row .ui-label-text { width: 220px; white-space: nowrap; }
#rwl-save-default-row .ui-label-text { width: 340px; white-space: nowrap; }
.rwl-kbd-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.rwl-kbd-table th { text-align: left; padding: 4px 8px 6px; font-size: 11px; color: #fff; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.15); }
.rwl-kbd-table td { padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.08); vertical-align: middle; color: #fff; }
.rwl-kbd-table tr:last-child td { border-bottom: none; }
.rwl-kbd-table kbd { display: inline-block; padding: 2px 7px; border-radius: 4px; background-color: var(--theme-backgruondcolorc, #00000040); box-shadow: 1px 1px 1px #ffffff29, -1px -1px 1px #ffffff29; font-family: inherit; font-size: 11px; white-space: nowrap; }
`;

export async function setup(os) {
    os.addCSS('cp-responsivelayout', _CSS);
    await app.ui.ensureLoaded(os, ['dropmenu']);
}

function tierLabel(tier) {
    return { mobile: _('Mobile'), tablet: _('Tablet'), desktop: _('Desktop'), largeDesktop: _('Large Desktop') }[tier] || tier;
}

function sourceLabel(source) {
    return { user: _('My Layout'), 'system-default': _('System Default'), auto: _('Auto Layout') }[source] || source;
}

function checkBreakpointOrdering(bp) {
    const errors = [];
    if (Number.isFinite(bp.tablet) && Number.isFinite(bp.mobile) && bp.tablet <= bp.mobile) errors.push(_('Tablet must be greater than Mobile.'));
    if (Number.isFinite(bp.desktop) && Number.isFinite(bp.tablet) && bp.desktop <= bp.tablet) errors.push(_('Desktop must be greater than Tablet.'));
    if (Number.isFinite(bp.largeDesktop) && Number.isFinite(bp.desktop) && bp.largeDesktop <= bp.desktop) errors.push(_('Large Desktop must be greater than Desktop.'));
    return errors;
}

// Illustrative-only fake-window strip showing how many windows the grid
// would place side by side at this tier's configured column count. Never
// reflects real open windows — purely a visual aid, capped at 6 boxes so a
// large column count doesn't produce an absurd preview. When the tier's
// column cap is turned off, there's no single deterministic count to show
// (the algorithm decides freely) — shown as a plain note instead of boxes.
function previewHTML(columnCount, id, columnsOn) {
    if (!columnsOn) return `<p class="rwl-note rwl-preview-off" id="${id}">${_('No limit — the grid decides automatically.')}</p>`;
    const n = Math.max(1, Math.min(Number(columnCount) || 1, 6));
    const boxes = Array.from({ length: n }).map(() => '<div class="rwl-fake-win"></div>').join('');
    return `<div class="rwl-preview" id="${id}" style="grid-template-columns: repeat(${n}, 1fr);">${boxes}</div>`;
}

// Plain html blocks (no field/label split) inside a background-settings-container row.
function rawRow(html) {
    return { block: { style: 'display:contents;', html } };
}

// Plain key names (Tab, Shift, Enter, Esc, ...) are left untranslated -
// keyboard key labels stay in their physical/English form across locales.
// "Hold "/"Release " are real translatable words, not key labels, though -
// wrapped in their own () => _(...) thunk like the description column,
// otherwise "Hold Shift + W" would stay English even in a Swedish session.
// Covers the OS-wide keyboard-navigation system documented across this
// session's own work: native Tab order (phase 1-2), Tab+S/M/I
// skip-navigation (phase 3), and the Shift+W window switcher (phase 4) -
// plus W+F4, listed here as a documented target shortcut even though it
// isn't implemented yet (see project_keyboard_navigation memory).
const KBD_OVERVIEW_ROWS = [
    ['Tab', () => _('Next interactive element')],
    ['Shift + Tab', () => _('Previous interactive element')],
    ['Tab + S', () => _('Open Start')],
    ['Tab + M', () => _('Go to menu')],
    ['Tab + I', () => _('Go to content')],
    [() => _('Hold') + ' Shift + W', () => _('Open window switcher')],
    ['←', () => _('Switch to previous window')],
    ['→', () => _('Switch to next window')],
    ['↑', () => _('Select window above')],
    ['↓', () => _('Select window below')],
    [() => _('Release') + ' Shift + W', () => _('Activate selected window')],
    ['W + F4', () => _('Close active window')],
    ['Enter', () => _('Activate selected item')],
    ['Space', () => _('Activate button/selection')],
    ['Esc', () => _('Close current view/dialog')],
];

function keyboardOverviewHTML() {
    const rows = KBD_OVERVIEW_ROWS.map(([keys, fn]) => {
        const keyLabel = typeof keys === 'function' ? keys() : keys;
        return `<tr><td><kbd>${app.util.escapeHtml(keyLabel)}</kbd></td><td>${app.util.escapeHtml(fn())}</td></tr>`;
    }).join('');
    return `<table class="rwl-kbd-table">` +
        `<thead><tr><th>${app.util.escapeHtml(_('Key combination'))}</th><th>${app.util.escapeHtml(_('Function'))}</th></tr></thead>` +
        `<tbody>${rows}</tbody>` +
        `</table>`;
}

const LINE = { block: { className: 'line' } };

function renderPanel(os) {
    const api = app.responsiveLayout?.api;
    if (!api) return `<div class="pd"><p>${_('Responsive Window Layout is still loading.')}</p></div>`;

    const config      = api.getConfig();
    const enabled     = api.isEnabled();
    const validation  = config ? api.validate(config) : { ok: false, errors: [_('Configuration not found.')] };
    const available   = enabled && validation.ok;
    const isAdmin      = api.isAdmin();
    const userId       = api.getCurrentUserId();
    const tier         = app.responsiveLayout.engine?.resolveCurrentTier?.() || 'desktop';
    const width        = window.innerWidth;
    const layoutInfo   = available ? api.getResponsiveLayout(userId, tier) : { source: 'auto', rects: {} };
    const hasOwnLayout = layoutInfo.source === 'user';

    const sections = [
        { block: { className: 'h1', html: _('Responsive Window Layout') } },
        { block: { className: 'p', html: _('Adjust how your windows are placed') } },
        LINE,
    ];

    // ── Status ───────────────────────────────────────────────────────
    if (available) {
        sections.push(rawRow(`<div class="rwl-status"><span class="rwl-dot rwl-dot-active"></span>${_('Active')}</div>`));
    } else if (!enabled) {
        sections.push(rawRow(
            `<div class="rwl-status"><span class="rwl-dot rwl-dot-off"></span>${_('Not Available')}</div>` +
            `<div class="rwl-reason">${_('Responsive Window Layout is disabled. Windows keep their current position and size — nothing is arranged automatically.')}</div>` +
            (isAdmin ? `<div class="aero-button" id="rwl-enable">${_('Enable Responsive Window Layout')}</div>` : '')
        ));
    } else {
        sections.push(rawRow(
            `<div class="rwl-status"><span class="rwl-dot rwl-dot-warn"></span>${_('Not Available')}</div>` +
            `<div class="rwl-reason">${_('Configuration is invalid.')}</div>` +
            `<ul class="rwl-errors">${validation.errors.map(e => `<li>${app.util.escapeHtml(e)}</li>`).join('')}</ul>` +
            (isAdmin ? `<div class="aero-button" id="rwl-validate">${_('Validate Configuration')}</div>` : '')
        ));
    }

    // ── Snap Layout ──────────────────────────────────────────────────
    if (isAdmin) {
        const snapEnabled = api.isSnapEnabled();
        sections.push(
            LINE,
            { block: { className: 'h2', html: app.util.escapeHtml(_('Snap Layout')) } },
            {
                block: {
                    className: 'background-settings-container',
                    subs: [
                        { block: { id: 'rwl-snap-enable-row', style: 'display:contents;', subs: [os.ui.label(app.util.escapeHtml(_('Snap Layout')), 'rwl-snap-toggle', `<label class="switch-def"><input type="checkbox" id="rwl-snap-toggle" ${snapEnabled ? 'checked' : ''}><span class="slider"></span></label>`)] } },
                        LINE,
                        { block: { style: 'display:contents;', subs: [os.ui.label(app.util.escapeHtml(_('How it works')), null, `<div class="aero-button" id="rwl-snap-configure">${app.util.escapeHtml(_('Configure'))}</div>`)] } },
                        rawRow(`<div id="rwl-snap-desc" style="display:none;"><p class="rwl-desc">${app.util.escapeHtml(_('Drag a window to the middle of a workspace edge to snap it to half the screen (50%). Drag toward the top or bottom corner instead to snap it to a quarter (25%) — if another window already fills that half, it shrinks to make room for the two quarters. Hold Shift while dragging to move a window freely without snapping. Only active at 768px width and above.'))}</p><p class="rwl-desc">${app.util.escapeHtml(_('Keyboard shortcuts work the same way without dragging: hold W and press Left/Right for a half, Up to maximize, Down to restore/un-snap/minimize, or Left/Right plus Up/Down for a quarter. Or use the number keys 1–9 in the same layout as a numeric keypad — 4/6 for halves, 8 or 5 to maximize, 2 to restore, 7/9/1/3 for quarters.'))}</p></div>`),
                    ]
                }
            }
        );
    }

    // ── Consolidated Keyboard Overview ──────────────────────────────────
    sections.push(
        LINE,
        { block: { className: 'h2', html: app.util.escapeHtml(_('Consolidated Keyboard Overview')) } },
        { block: { className: 'background-settings-container', subs: [rawRow(keyboardOverviewHTML())] } }
    );

    // ── My Layout ────────────────────────────────────────────────────
    if (available) {
        const rows = [
            { block: { id: 'rwl-breakpoint-wrap', style: 'display:contents;', search: { label: () => _('Current breakpoint'), keywords: ['breakpoint', 'viewport', 'responsive'] }, subs: [os.ui.label(_('Current breakpoint'), null, `<span class="rwl-value">${tierLabel(tier)} · ${width}px</span>`)] } },
            LINE,
            { block: { id: 'rwl-source-wrap', style: 'display:contents;', search: { label: () => _('Layout source'), keywords: ['layout', 'source'] }, subs: [os.ui.label(_('Layout source'), null, `<span class="rwl-value">${sourceLabel(layoutInfo.source)}</span>`)] } },
        ];
        rows.push(LINE, {
            block: {
                style: 'display:contents;',
                subs: [os.ui.label(
                    hasOwnLayout ? _('Personal layout') : _('No personal layout has been saved.'),
                    null,
                    `<div class="rwl-actions">` +
                        `<div class="aero-button" id="rwl-save-mine">${hasOwnLayout ? _('Save Layout') : _('Save Current Layout')}</div>` +
                        (hasOwnLayout ? `<div class="aero-button" id="rwl-reset-mine">${_('Reset to Default')}</div>` : '') +
                    `</div>`
                )]
            }
        });

        sections.push(
            LINE,
            { block: { className: 'h2', html: _('My Layout') } },
            { block: { className: 'background-settings-container', subs: rows } }
        );
    }

    // ── Administrator ────────────────────────────────────────────────
    if (isAdmin) {
        const bp = config?.default?.breakpoints || { mobile: 0, tablet: 768, desktop: 1024, largeDesktop: 1440 };
        const bpErrors = checkBreakpointOrdering(bp);
        const users = app.config.users || [];

        const cols = config?.default?.columns || { mobile: 1, tablet: 2, desktop: 3, largeDesktop: 4 };
        const colsEnabled = config?.default?.columnsEnabled || { mobile: false, tablet: true, desktop: true, largeDesktop: false };

        const bpRow = (labelText, tierKey, pxId, pxValue, colId, colValue, colOn) => ({
            block: {
                style: 'display:contents;',
                subs: [os.ui.label(
                    labelText,
                    pxId,
                    `<input type="number" id="${pxId}" class="rwl-bp-input" value="${pxValue}"> px` +
                    `<span class="rwl-col-field">` +
                        `<label class="switch-def switch-def-sm" title="${_('Enable column limit')}">` +
                            `<input type="checkbox" class="rwl-col-toggle" data-tier="${tierKey}" ${colOn ? 'checked' : ''}>` +
                            `<span class="slider"></span>` +
                        `</label>` +
                        `<span class="rwl-col-label">${_('Columns')}</span>` +
                        `<input type="number" id="${colId}" data-tier="${tierKey}" class="rwl-col-input" min="1" value="${colValue}" ${colOn ? '' : 'disabled'}>` +
                    `</span>`
                )]
            }
        });

        const tierRow = (labelText, tierKey, pxId, colId, previewId) =>
            [bpRow(labelText, tierKey, pxId, bp[tierKey], colId, cols[tierKey], colsEnabled[tierKey]),
             LINE,
             rawRow(previewHTML(cols[tierKey], previewId, colsEnabled[tierKey])),
             LINE];

        const adminRows = [
            { block: { id: 'rwl-enable-row', style: 'display:contents;', subs: [os.ui.label(_('Responsive Window Layout'), 'rwl-toggle-enabled', `<label class="switch-def"><input type="checkbox" id="rwl-toggle-enabled" class="lock" ${enabled ? 'checked' : ''}><span class="slider"></span></label>`)] } },
            LINE,
            rawRow(`<p class="rwl-desc">${_('Breakpoints decide which layout tier is active based on window width. The small switch next to Columns turns the column limit on or off for that tier — off means the automatic grid decides freely. The preview below each row is illustrative only.')}</p>`),
            LINE,
            ...tierRow(_('Mobile'), 'mobile', 'rwl-bp-mobile', 'rwl-col-mobile', 'rwl-preview-mobile'),
            ...tierRow(_('Tablet'), 'tablet', 'rwl-bp-tablet', 'rwl-col-tablet', 'rwl-preview-tablet'),
            ...tierRow(_('Desktop'), 'desktop', 'rwl-bp-desktop', 'rwl-col-desktop', 'rwl-preview-desktop'),
            ...tierRow(_('Large Desktop'), 'largeDesktop', 'rwl-bp-largeDesktop', 'rwl-col-largeDesktop', 'rwl-preview-largeDesktop'),
            rawRow(`<div class="rwl-bp-warn" id="rwl-bp-warn" style="${bpErrors.length ? '' : 'display:none;'}">${bpErrors.join(' ')}</div>`),
            LINE,
            { block: { id: 'rwl-save-default-row', style: 'display:contents;', subs: [os.ui.label(_('Save Current Layout as System Default'), null, `<div class="aero-button" id="rwl-save-default">${_('Save')}</div>`)] } },
            LINE,
            rawRow(
                users.length
                    ? users.map(u => {
                        const uid = u.id || u.username || u.profile?.name || '';
                        const src = available ? api.getResponsiveLayout(uid, tier).source : 'auto';
                        return (
                            `<div class="rwl-user-row">` +
                                `<span class="rwl-user-name">${app.util.escapeHtml(u.name || u.username || uid)}</span>` +
                                `<span class="rwl-user-source">${sourceLabel(src)}</span>` +
                                `<span class="aero-button" data-rwl-reset-user="${app.util.escapeHtml(uid)}">${_('Reset')}</span>` +
                            `</div>`
                        );
                    }).join('')
                    : `<p class="rwl-note">${_('No other users configured.')}</p>`
            ),
            LINE,
            {
                block: {
                    style: 'display:contents;',
                    subs: [os.ui.label(
                        _('Configuration status'),
                        null,
                        `<div class="rwl-actions">` +
                            `<span class="rwl-value">${validation.ok ? _('Valid') : _('Invalid')}</span>` +
                            `<div class="aero-button" id="rwl-validate-config">${_('Validate')}</div>` +
                        `</div>`
                    )]
                }
            },
        ];
        if (!validation.ok) {
            adminRows.push(LINE, rawRow(`<ul class="rwl-errors">${validation.errors.map(e => `<li>${app.util.escapeHtml(e)}</li>`).join('')}</ul>`));
        }

        sections.push(
            LINE,
            { block: { className: 'background-settings-container', subs: adminRows } }
        );
    }

    const layout = {
        container: {
            className: 'cp-customizer',
            style: 'margin-right:20px;padding:28px;display:flex;justify-content:center;overflow-y:auto;height:max-content;',
            subs: [{ block: { style: 'max-width:1024px;width:100%;', subs: sections } }]
        }
    };

    return os.ui.body(layout, { programid: 'controlpanel', panelId: 'responsivelayout' }).render();
}

function bindPanel(os) {
    const api = app.responsiveLayout?.api;
    if (!api) return;

    const rerender = () => { $('#cp-tab-content').html(renderPanel(os)); bindPanel(os); };

    $('#rwl-enable').off('click').on('click', () => {
        api.setEnabled(true);
        rerender();
    });

    $('#rwl-toggle-enabled').off('change').on('change', e => {
        api.setEnabled(e.target.checked);
        rerender();
    });

    $('#rwl-validate, #rwl-validate-config').off('click').on('click', () => rerender());

    $('#rwl-snap-toggle').off('change').on('change', e => {
        api.setSnapEnabled(e.target.checked);
        rerender();
    });

    $('#rwl-snap-configure').off('click').on('click', () => {
        $('#rwl-snap-desc').slideToggle(150);
    });

    $('#rwl-save-mine').off('click').on('click', e => {
        e.stopPropagation();
        const tier = app.responsiveLayout.engine?.resolveCurrentTier?.() || 'desktop';
        const rects = api.captureCurrentLayout();
        const names = Object.keys(rects);
        app.ui.confirm({
            title: _('Save Layout'),
            icon: '#ic-cp-responsivelayout',
            confirm: _('Save'),
            cancel: _('Cancel'),
            body: () => (
                `<p>${_('Current breakpoint')}: <b>${tierLabel(tier)}</b></p>` +
                `<p>${_('Open windows')}</p>` +
                `<ul class="rwl-checklist">${names.map(n => `<li>${app.util.escapeHtml(n)}</li>`).join('') || `<li>${_('None')}</li>`}</ul>`
            ),
            onConfirm: () => {
                api.saveUserLayout(api.getCurrentUserId(), tier, rects);
                rerender();
            }
        });
    });

    $('#rwl-reset-mine').off('click').on('click', e => {
        e.stopPropagation();
        const tier = app.responsiveLayout.engine?.resolveCurrentTier?.() || 'desktop';
        const fallback = api.getSystemDefaultLayout()?.windows?.[tier];
        const fallbackLabel = fallback && Object.keys(fallback).length ? _('System Default') : _('Automatic Layout');
        app.ui.confirm({
            title: _('Reset Layout?'),
            icon: '#ic-cp-responsivelayout',
            confirm: _('Reset'),
            cancel: _('Cancel'),
            body: () => (
                `<p>${_('Your personal layout for')} <b>${tierLabel(tier)}</b> ${_('will be removed.')}</p>` +
                `<p>${_('The layout will use')}: <b>${fallbackLabel}</b></p>`
            ),
            onConfirm: () => {
                api.resetUserLayout(api.getCurrentUserId(), tier);
                rerender();
            }
        });
    });

    const readBreakpointFields = () => ({
        mobile: parseFloat($('#rwl-bp-mobile').val()),
        tablet: parseFloat($('#rwl-bp-tablet').val()),
        desktop: parseFloat($('#rwl-bp-desktop').val()),
        largeDesktop: parseFloat($('#rwl-bp-largeDesktop').val())
    });

    const $bpInputs = $('#rwl-bp-mobile, #rwl-bp-tablet, #rwl-bp-desktop, #rwl-bp-largeDesktop');

    $bpInputs.off('input').on('input', () => {
        const errors = checkBreakpointOrdering(readBreakpointFields());
        $('#rwl-bp-warn').toggle(errors.length > 0).text(errors.join(' '));
    });

    $bpInputs.off('change').on('change', () => {
        const bp = readBreakpointFields();
        if (checkBreakpointOrdering(bp).length) return;
        api.saveSystemDefaultBreakpoints(bp);
        rerender();
    });

    const $colInputs = $('.rwl-col-input');
    $colInputs.off('input').on('input', e => {
        const tierKey = e.target.dataset.tier;
        const preview = document.getElementById(`rwl-preview-${tierKey}`);
        if (!preview) return;
        const n = Math.max(1, Math.min(parseInt(e.target.value, 10) || 1, 6));
        preview.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
        preview.innerHTML = '<div class="rwl-fake-win"></div>'.repeat(n);
    });
    $colInputs.off('change').on('change', () => {
        const columns = {
            mobile: parseInt($('#rwl-col-mobile').val(), 10),
            tablet: parseInt($('#rwl-col-tablet').val(), 10),
            desktop: parseInt($('#rwl-col-desktop').val(), 10),
            largeDesktop: parseInt($('#rwl-col-largeDesktop').val(), 10)
        };
        if (Object.values(columns).some(v => !Number.isInteger(v) || v < 1)) return;
        api.saveSystemDefaultColumns(columns);
        rerender();
    });

    $('.rwl-col-toggle').off('change').on('change', e => {
        api.setColumnsEnabled(e.target.dataset.tier, e.target.checked);
        rerender();
    });

    $('#rwl-save-default').off('click').on('click', e => {
        e.stopPropagation();
        const tier = app.responsiveLayout.engine?.resolveCurrentTier?.() || 'desktop';
        const rects = api.captureCurrentLayout();
        const names = Object.keys(rects);
        app.ui.confirm({
            title: _('Save Current Layout as System Default'),
            icon: '#ic-cp-responsivelayout',
            confirm: _('Save'),
            cancel: _('Cancel'),
            body: () => (
                `<p>${_('Current breakpoint')}: <b>${tierLabel(tier)}</b></p>` +
                `<p>${_('Open windows')}</p>` +
                `<ul class="rwl-checklist">${names.map(n => `<li>${app.util.escapeHtml(n)}</li>`).join('') || `<li>${_('None')}</li>`}</ul>`
            ),
            onConfirm: () => {
                api.saveSystemDefaultLayout(tier, rects);
                rerender();
            }
        });
    });

    $('[data-rwl-reset-user]').off('click').on('click', function () {
        const uid = $(this).data('rwl-reset-user');
        const tier = app.responsiveLayout.engine?.resolveCurrentTier?.() || 'desktop';
        api.resetUserLayout(String(uid), tier);
        rerender();
    });
}

export function render(os) {
    const html = renderPanel(os);
    setTimeout(() => bindPanel(os), 0);
    return html;
}
