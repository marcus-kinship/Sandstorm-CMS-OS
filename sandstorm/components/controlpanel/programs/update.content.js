/**
 * @file controlpanel/programs/update.content.js
 * @description Updates panel content — lazy-loaded on first open via
 * `update.js`'s `panel.contentPath`.
 *
 * @module components/controlpanel/programs/update.content
 */

export function render(os) {
    const statusCardHTML = `
        <div style="display:flex;align-items:center;gap:16px;padding:18px;border-radius:10px;background:var(--theme-backgruondcolorc,#00000040);margin-bottom:24px;">
            <svg width="40" height="40" viewBox="0 0 512 512" fill="none" stroke="#4ade80" stroke-linecap="round" stroke-linejoin="round" stroke-width="32">
                <path d="M434.67 285.59v-29.8c0-98.73-80.24-178.79-179.2-178.79a179 179 0 00-140.14 67.36m-38.53 82v29.8C76.8 355 157 435 256 435a180.45 180.45 0 00140-66.92"/>
                <path d="M32 256l44-44 46 44M480 256l-44 44-46-44"/>
            </svg>
            <div>
                <div class="cp-label" style="font-size:13px;letter-spacing:0;text-transform:none;" id="cp-update-status-label">${_('Your system is up to date')}</div>
                <div class="cp-value" style="font-size:11px;margin-top:4px;" id="cp-update-checked">${_('Last checked')}: ${_('Never')}</div>
            </div>
        </div>`;

    const layout = {
        container: {
            style: 'padding:28px;overflow-y:auto;height:100%;box-sizing:border-box;',
            subs: [{
                block: {
                    style: 'max-width:640px;',
                    subs: [
                        { block: { className: 'h1', html: _('Updates') } },
                        { block: { className: 'p',  html: _('Keep your system up to date') } },
                        { block: { className: 'line' } },

                        // Status card — searchable
                        { block: {
                            id: 'cp-update-status-card',
                            html: statusCardHTML,
                            search: { label: () => _('System update status'), description: () => _('Whether your system is up to date'), keywords: ['status', 'up to date', 'system', 'update'] }
                        }},

                        os.ui.infoRow('updates-version', _('Current version'), 'Sandstorm CMS OS — Dev (Build 1.0.0)', ['version', 'build', '1.0.0', 'sandstorm']),
                        { block: { className: 'line' } },
                        os.ui.infoRow('updates-channel', _('Channel'), _('Stable'), ['channel', 'stable', 'release', 'beta']),

                        { block: { className: 'line' } },

                        // Buttons row — each button searchable via display:contents wrapper
                        { block: {
                            style: 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;',
                            subs: [
                                { block: {
                                    id: 'updates-check-btn',
                                    style: 'display:contents;',
                                    search: { label: () => _('Check for updates'), keywords: ['check', 'update', 'upgrade', 'install', 'patch'] },
                                    html: `<button class="aero-button confirm" id="cp-update-check">${_('Check for updates')}</button>`
                                }},
                                { block: {
                                    id: 'updates-history-btn',
                                    style: 'display:contents;',
                                    search: { label: () => _('Update history'), keywords: ['history', 'log', 'installed', 'changelog'] },
                                    html: `<button class="aero-button" id="cp-update-history">${_('Update history')}</button>`
                                }}
                            ]
                        }},

                        // Result area
                        { block: {
                            id: 'cp-update-result',
                            style: 'display:none;padding:12px;border-radius:8px;background:var(--theme-backgruondcolorc,#00000040);font-size:12px;color:var(--theme-fontcolor,#fff);'
                        }},

                        { block: { className: 'line' } },
                        { block: { className: 'h1', style: 'font-size:13px;', html: _('Update readiness') } },
                        { block: { className: 'p', style: 'font-size:11px;opacity:.7;',
                            html: _('What the system would check before switching to a new version. The server makes the final decision.') } },

                        // The live agent panel (rendered by app.updates.panel.render via _refreshPanels)
                        { block: { id: 'cp-updates-agent-panel', attributes: { 'data-updates-panel': '' } } },

                        // Raw readiness snapshot (dev visibility)
                        { block: {
                            id: 'cp-updates-readiness',
                            style: 'margin-top:10px;padding:10px;border-radius:8px;background:var(--theme-backgruondcolorc,#00000040);font-family:monospace;font-size:10.5px;white-space:pre-wrap;color:var(--theme-fontcolor,#fff);opacity:.85;'
                        }}
                    ]
                }
            }]
        }
    };

    setTimeout(() => {
        const checkBtn  = $('#cp-update-check')[0];
        const histBtn   = $('#cp-update-history')[0];
        const resultEl  = $('#cp-update-result')[0];
        const statusLbl = $('#cp-update-status-label')[0];
        const checkedEl = $('#cp-update-checked')[0];

        checkBtn?.addEventListener('click', function () {
            checkBtn.disabled = true;
            if (statusLbl) statusLbl.textContent = _('Checking for updates…');
            setTimeout(() => {
                checkBtn.disabled = false;
                if (statusLbl) statusLbl.textContent = _('Your system is up to date');
                const now = new Date().toLocaleTimeString();
                if (checkedEl) checkedEl.textContent = `${_('Last checked')}: ${now}`;
                if (resultEl) {
                    resultEl.style.display = 'block';
                    resultEl.textContent = _('No updates available. Your system is running the latest version.');
                }
            }, 2000);
        });

        histBtn?.addEventListener('click', function () {
            if (resultEl) {
                resultEl.style.display = 'block';
                resultEl.innerHTML = `
                    <div style="font-weight:600;margin-bottom:8px;">${_('Update history')}</div>
                    <div style="opacity:0.55;font-style:italic;font-size:11px;">${_('No updates have been installed.')}</div>`;
            }
        });

        // ── Live update readiness agent ──────────────────────────────────────
        const agentEl     = document.getElementById('cp-updates-agent-panel');
        const readinessEl  = document.getElementById('cp-updates-readiness');

        function paintReadiness() {
            if (!window.app?.updates) return;
            if (agentEl) app.updates._refreshPanels?.();
            if (readinessEl) {
                try { readinessEl.textContent = JSON.stringify(app.updates.readiness.collect(), null, 2); }
                catch (e) { readinessEl.textContent = String(e); }
            }
        }
        paintReadiness();
        const _readinessTimer = setInterval(paintReadiness, 3000);
        // Stop polling the snapshot when the panel leaves the DOM.
        const _obs = new MutationObserver(() => {
            if (!document.body.contains(readinessEl)) { clearInterval(_readinessTimer); _obs.disconnect(); }
        });
        _obs.observe(document.body, { childList: true, subtree: true });
    }, 0);

    return os.ui.body(layout, { programid: 'controlpanel', panelId: 'updates' }).render();
}
