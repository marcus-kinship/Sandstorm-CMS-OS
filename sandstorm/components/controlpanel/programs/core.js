/**
 * @file controlpanel/programs/core.js
 * @description Manifest for the System / Core info panel.
 *
 * Boot-loaded — only registers the launcher-tile icon + `front`/`searchItems`
 * metadata. The actual panel content lives in the sibling `core.content.js`,
 * loaded on first open via `panel.contentPath`.
 *
 * @module components/controlpanel/programs/core
 */

export function setup(os) {

    os.svg.global.load({
        id: 'ic-cp-core',
        viewBox: '0 0 24 24',
        content: `<path fill="white" d="M17 11h3V9h-3V7l-3-3-2 2-2-2-3 3v2H5v2h3v2H5v2h3v2l3 3 2-2 2 2 3-3v-2h3v-2h-3v-2zm-5 6-3-3V7.83L11.17 6h1.66L15 7.83V14l-3 3z"/>`
    });

    os.controlpanel.add({
        front: {
            name:     'system',
            icon:     '#ic-cp-core',
            type:     'svg',
            label:    () => _('System'),
            keywords: ['system', 'core', 'hardware', 'memory', 'performance', 'diagnostics']
        },
        panel: {
            id:   'system',
            name: () => _('System'),
            searchItems: [
                { id: 'core-mem',          label: () => _('JS Memory'),    keywords: ['memory', 'heap', 'ram', 'usage', 'performance'] },
                { id: 'core-cpu',          label: () => _('CPU Cores'),    keywords: ['cpu', 'cores', 'processor', 'hardware'] },
                { id: 'core-conn',         label: () => _('Connection'),   keywords: ['connection', 'network', 'internet', 'speed'] },
                { id: 'core-online',       label: () => _('Online'),       keywords: ['online', 'offline', 'network', 'internet'] },
                { id: 'core-cookies',      label: () => _('Cookies'),      keywords: ['cookies', 'cookie', 'enabled', 'disabled'] },
                { id: 'core-dnt',          label: () => _('Do Not Track'), keywords: ['do not track', 'dnt', 'privacy', 'tracking'] },
            ],
            contentPath: 'controlpanel/programs/core.content.js',
            renderExport: 'render',
        }
    });
}

export function start() {}
