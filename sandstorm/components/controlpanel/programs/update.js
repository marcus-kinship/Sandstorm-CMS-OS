/**
 * @file controlpanel/programs/update.js
 * @description Manifest for the Updates panel.
 *
 * Boot-loaded — registers the launcher-tile icon, `front`/`searchItems`
 * metadata, AND `app.updates.startMenuUpdateTab()`. That stays here (not in
 * the lazy content module) because `startmenu/tabs.js` calls
 * `app.updates.startMenuUpdateTab()` whenever the Start Menu's Updates tab
 * renders — which can happen before the user has ever opened Control Panel.
 * The actual panel content lives in the sibling `update.content.js`, loaded
 * on first open via `panel.contentPath`.
 *
 * @module components/controlpanel/programs/update
 */

export function setup(os) {

    os.svg.global.load({
        id: 'ic-cp-update',
        viewBox: '0 0 24 24',
        content: `<path fill="white" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>`
    });

    // ── Startmenu tab data ────────────────────────────────────────────────────

    if (!window.app.updates) window.app.updates = {};

    app.updates.startMenuUpdateTab = function () {
        return {
            title:    _('Updates'),
            icontype: 'svg',
            icon:     '#ic-updates',
            tab: function () {
                return `
                    <div class="pd" style="padding-top:18px;padding-bottom:18px;color:var(--theme-fontcolor,#fff);">
                        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:14px;border-radius:10px;background:var(--theme-backgruondcolorc,#00000040);">
                            <svg width="30" height="30" viewBox="0 0 512 512" fill="none" stroke="#4ade80" stroke-linecap="round" stroke-linejoin="round" stroke-width="36">
                                <path d="M434.67 285.59v-29.8c0-98.73-80.24-178.79-179.2-178.79a179 179 0 00-140.14 67.36m-38.53 82v29.8C76.8 355 157 435 256 435a180.45 180.45 0 00140-66.92"/>
                                <path d="M32 256l44-44 46 44M480 256l-44 44-46-44"/>
                            </svg>
                            <div>
                                <div style="font-weight:600;font-size:13px;" id="sm-update-status">${_('Up to date')}</div>
                                <div style="font-size:11px;opacity:0.6;margin-top:2px;">${_('Version')} 1.0.0</div>
                            </div>
                        </div>
                        <button class="aero-button" id="sm-update-check" style="font-size:11px;width:100%;">
                            ${_('Check for updates')}
                            <div class="after pulse"></div>
                        </button>
                    </div>
                `;
            },
            callback: function () {
                const btn = $('#sm-update-check')[0];
                if (!btn) return;
                btn.addEventListener('click', function () {
                    btn.disabled = true;
                    const statusEl = $('#sm-update-status')[0];
                    if (statusEl) statusEl.textContent = _('Checking…');
                    setTimeout(() => {
                        btn.disabled = false;
                        if (statusEl) statusEl.textContent = _('Up to date');
                    }, 2000);
                });
            }
        };
    };

    // ── Control panel tab ─────────────────────────────────────────────────────

    os.controlpanel.add({
        front: {
            name:     'updates',
            icon:     '#ic-cp-update',
            type:     'svg',
            label:    () => _('Updates'),
            keywords: ['updates', 'version', 'upgrade', 'install', 'patch', 'system']
        },
        panel: {
            id:   'updates',
            name: () => _('Updates'),
            searchItems: [
                { id: 'cp-update-status-card', label: () => _('System update status'), keywords: ['status', 'up to date', 'system', 'update'] },
                { id: 'updates-version',       label: () => _('Current version'),       keywords: ['version', 'build', 'sandstorm'] },
                { id: 'updates-channel',       label: () => _('Channel'),               keywords: ['channel', 'stable', 'release', 'beta'] },
                { id: 'updates-check-btn',     label: () => _('Check for updates'),     keywords: ['check', 'update', 'upgrade', 'install', 'patch'] },
                { id: 'updates-history-btn',   label: () => _('Update history'),        keywords: ['history', 'log', 'installed', 'changelog'] },
            ],
            contentPath: 'controlpanel/programs/update.content.js',
            renderExport: 'render',
        }
    });
}

export function start() {}
