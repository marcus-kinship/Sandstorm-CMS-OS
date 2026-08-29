/**
 * @file controlpanel/programs/core.content.js
 * @description System / Core info panel content — lazy-loaded on first open
 * via `core.js`'s `panel.contentPath`.
 *
 * @module components/controlpanel/programs/core.content
 */

export function render(os) {
    const mem    = performance?.memory;
    const memStr = mem
        ? `${Math.round(mem.usedJSHeapSize / 1048576)} MB / ${Math.round(mem.jsHeapSizeLimit / 1048576)} MB`
        : '—';

    const infoRow = os.ui.infoRow;

    const layout = {
        container: {
            style: 'padding:28px;overflow-y:auto;height:100%;box-sizing:border-box;',
            subs: [{
                block: {
                    style: 'max-width:640px;',
                    subs: [
                        { block: { className: 'h1', html: _('System') } },
                        { block: { className: 'p',  html: _('Runtime diagnostics and performance') } },
                        { block: { className: 'line' } },
                        infoRow('core-mem',     _('JS Memory'),    memStr,                                                        ['memory', 'heap', 'ram', 'usage', 'performance']),
                        { block: { className: 'line' } },
                        infoRow('core-cpu',     _('CPU Cores'),    String(navigator.hardwareConcurrency || '—'),                  ['cpu', 'cores', 'processor', 'hardware']),
                        { block: { className: 'line' } },
                        infoRow('core-conn',    _('Connection'),   navigator.connection?.effectiveType || '—',                   ['connection', 'network', 'internet', 'speed']),
                        { block: { className: 'line' } },
                        infoRow('core-online',  _('Online'),       navigator.onLine ? _('Yes') : _('No'),                        ['online', 'offline', 'network', 'internet']),
                        { block: { className: 'line' } },
                        infoRow('core-cookies', _('Cookies'),      navigator.cookieEnabled ? _('Enabled') : _('Disabled'),       ['cookies', 'cookie', 'enabled', 'disabled']),
                        { block: { className: 'line' } },
                        infoRow('core-dnt',     _('Do Not Track'), navigator.doNotTrack === '1' ? _('Yes') : _('No'),            ['do not track', 'dnt', 'privacy', 'tracking']),
                    ]
                }
            }]
        }
    };

    setTimeout(() => {
        const iv = setInterval(() => {
            const memEl = document.getElementById('core-mem');
            if (!memEl) { clearInterval(iv); return; }
            const m = performance?.memory;
            memEl.querySelector('.cp-value').textContent = m
                ? `${Math.round(m.usedJSHeapSize / 1048576)} MB / ${Math.round(m.jsHeapSizeLimit / 1048576)} MB`
                : '—';
            document.getElementById('core-conn')?.querySelector('.cp-value')
                && (document.getElementById('core-conn').querySelector('.cp-value').textContent = navigator.connection?.effectiveType || '—');
            document.getElementById('core-online')?.querySelector('.cp-value')
                && (document.getElementById('core-online').querySelector('.cp-value').textContent = navigator.onLine ? _('Yes') : _('No'));
        }, 20000);
    }, 0);

    return os.ui.body(layout, { programid: 'controlpanel', panelId: 'system' }).render();
}
