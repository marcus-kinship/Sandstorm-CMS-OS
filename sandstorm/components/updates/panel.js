/**
 * @file components/updates/panel.js
 * @description The pre-swap / waiting / progress UI for the update agent.
 *
 * Rendered inside the Control Panel "Updates" page (update.content.js) and
 * available for the Start-menu Updates tab. Reads a readiness snapshot + the
 * server's last poll response; renders one of a small set of states. The
 * panel NEVER decides anything — it only reflects `app.updates.state` and
 * the latest server message.
 *
 * @module components/updates/panel
 */

function esc(s) {
    try { return app.util.escapeHtml(String(s ?? '')); } catch { return String(s ?? ''); }
}

function checkRow(ok, label) {
    return `<div class="upd-check ${ok ? 'ok' : 'wait'}">
        <span class="upd-check-mark">${ok ? '✓' : '⏳'}</span>
        <span>${esc(label)}</span>
    </div>`;
}

/** One-time CSS for the panel. */
function ensureCSS() {
    if (document.getElementById('sandstorm-updates-panel-css')) return;
    const s = document.createElement('style');
    s.id = 'sandstorm-updates-panel-css';
    s.textContent = `
        .upd-wrap { color: var(--theme-fontcolor,#fff); font-size:12px; line-height:1.5; }
        .upd-card { padding:14px 16px; border-radius:10px; background:var(--theme-backgruondcolorc,#00000040);
                    backdrop-filter: blur(var(--theme-blur,10px)); margin-bottom:12px; }
        .upd-title { font-weight:600; font-size:13px; margin-bottom:4px; }
        .upd-sub { opacity:.65; font-size:11px; }
        .upd-check { display:flex; align-items:center; gap:8px; padding:3px 0; }
        .upd-check-mark { width:16px; text-align:center; }
        .upd-check.ok  .upd-check-mark { color:#4ade80; }
        .upd-check.wait .upd-check-mark { color:#fbbf24; }
        .upd-meta { display:grid; grid-template-columns:auto 1fr; gap:2px 14px; margin-top:8px; font-size:11px; opacity:.8; }
        .upd-meta b { font-weight:600; opacity:1; }
        .upd-actions { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
        .upd-wait-badge { display:inline-flex; align-items:center; gap:6px; font-size:11px; opacity:.8; margin-top:8px; }
        .sandstorm-updating .upd-wrap { pointer-events:none; opacity:.7; }
    `;
    document.head.appendChild(s);
}

/**
 * @param {HTMLElement} container
 * @param {Object} ctx
 * @param {Object}  ctx.readiness   - readiness.collect() snapshot
 * @param {Object|null} ctx.server  - last server poll response (directive, lease, affected, server-side check flags)
 * @param {string} ctx.state        - app.updates.state
 */
export function render(container, ctx = {}) {
    ensureCSS();
    const { readiness = {}, server = null, state = 'idle' } = ctx;
    const affectedPrograms = (server && server.affectedPrograms) || [];
    const version = (server && server.currentVersion) || 'Sandstorm CMS OS — Dev (Build 1.0.0)';

    // Which open programs are both open AND affected AND have work in progress
    const busyAffected = (readiness.openPrograms || [])
        .filter(p => p.touchedByUpdate && (p.undoHistory || p.windows > 0));

    let html = '<div class="upd-wrap">';

    // ── No update pending ────────────────────────────────────────────────────
    if (!server || server.directive === 'idle' || state === 'idle') {
        html += `
            <div class="upd-card">
                <div class="upd-title">${_('Your system is up to date')}</div>
                <div class="upd-sub">${_('Version')}: ${esc(version)}</div>
            </div>
            <div class="upd-actions">
                <button class="aero-button confirm" data-upd-action="check">${_('Check for updates')}</button>
                <button class="aero-button" data-upd-action="history">${_('Update history')}</button>
            </div>`;
        html += '</div>';
        container.innerHTML = html;
        return;
    }

    // ── An update is prepared on the server ──────────────────────────────────
    const chk = (server && server.checks) || {};
    const noWrites = (readiness.inFlightWrites || 0) === 0;
    const noBusyAffected = busyAffected.length === 0;

    if (state === 'handoff' || state === 'cutover' || state === 'reconnecting') {
        html += `
            <div class="upd-card">
                <div class="upd-title">${_('Applying update…')}</div>
                <div class="upd-sub">${_('Please wait — this takes a few seconds.')}</div>
                <div class="upd-wait-badge">⏳ ${esc(state === 'reconnecting' ? _('Reconnecting…') : _('Switching over…'))}</div>
            </div>`;
    } else if (state === 'aborted') {
        html += `
            <div class="upd-card">
                <div class="upd-title">${_('Update postponed')}</div>
                <div class="upd-sub">${_('The system will try again later. Nothing was changed.')}</div>
            </div>`;
    } else if (state === 'complete') {
        html += `
            <div class="upd-card">
                <div class="upd-title">${_('System updated')}</div>
                <div class="upd-sub">${_('You can continue where you left off.')}</div>
            </div>`;
    } else if (!noWrites || !noBusyAffected) {
        // Deferred: someone is working on something the update touches.
        const who = busyAffected[0];
        html += `
            <div class="upd-card">
                <div class="upd-title">${_('Update is waiting')}</div>
                <div class="upd-sub">${
                    who
                        ? esc(who.id) + ' ' + _('is in use and is affected by this update.')
                        : _('Files are being saved right now.')
                } ${_('You don’t need to do anything.')}</div>
                <div class="upd-wait-badge">⏸ ${_('Waiting for a safe moment…')}</div>
                <div class="upd-meta">
                    <span>${_('Active writes')}</span><b>${readiness.inFlightWrites || 0}</b>
                    <span>${_('Affected programs in use')}</span><b>${busyAffected.length}</b>
                </div>
            </div>`;
    } else {
        // Ready: server prepared it, client sees nothing in the way.
        html += `
            <div class="upd-card">
                <div class="upd-title">${_('Update ready to install')}</div>
                <div class="upd-sub">${_('The system has prepared the new version.')}</div>
                <div style="margin-top:10px;">
                    ${checkRow(!!chk.backup,   _('Backup ready'))}
                    ${checkRow(!!chk.tested,   _('New version tested'))}
                    ${checkRow(noWrites,        _('No active writes'))}
                    ${checkRow(noBusyAffected,  _('No affected program working'))}
                    ${checkRow(!!chk.rollback, _('Rollback ready'))}
                </div>
                <div class="upd-meta">
                    ${affectedPrograms.length ? `<span>${_('Affected programs')}</span><b>${esc(affectedPrograms.join(', '))}</b>` : ''}
                    <span>${_('Open programs')}</span><b>${(readiness.openPrograms || []).length}</b>
                    ${server.estimatedDisruptionMs != null
                        ? `<span>${_('Estimated switchover')}</span><b>&lt; ${Math.ceil(server.estimatedDisruptionMs / 1000)}s</b>` : ''}
                </div>
            </div>
            <div class="upd-actions">
                <button class="aero-button confirm" data-upd-action="update-now">${_('Update now')}</button>
                <button class="aero-button" data-upd-action="defer">${_('Later')}</button>
            </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}
