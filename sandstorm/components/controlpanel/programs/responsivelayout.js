/**
 * @file controlpanel/programs/responsivelayout.js
 * @description Manifest for the "Responsive Window Layout" Control Panel
 * tile.
 *
 * Boot-loaded — only registers the launcher-tile icon + `front`/`searchItems`
 * metadata. The actual panel content (status, My Layout, Administrator
 * breakpoint/column editor, Snap Layout toggle) lives in the sibling
 * `responsivelayout.content.js`, loaded on first open via
 * `panel.contentPath`.
 *
 * @module components/controlpanel/programs/responsivelayout
 */

export function setup(os) {

    os.svg.global.load({
        id: 'ic-cp-responsivelayout',
        viewBox: '0 0 24 24',
        content: `<rect x="3" y="4" width="8" height="6" rx="1" fill="white" opacity="0.9"/><rect x="13" y="4" width="8" height="16" rx="1" fill="white" opacity="0.6"/><rect x="3" y="12" width="8" height="8" rx="1" fill="white" opacity="0.9"/>`
    });

    os.controlpanel.add({
        front: {
            name: 'responsivelayout',
            icon: '#ic-cp-responsivelayout',
            type: 'svg',
            label: () => _('Responsive Window Layout'),
            keywords: ['responsive', 'window', 'layout', 'breakpoint', 'arrange', 'mobile', 'tablet', 'desktop'],
        },
        panel: {
            id: 'responsivelayout',
            name: () => _('Responsive Window Layout'),
            searchItems: [
                { id: 'rwl-save-mine', label: () => _('Save Layout'), keywords: ['save', 'layout', 'window'] },
                { id: 'rwl-reset-mine', label: () => _('Reset to Default'), keywords: ['reset', 'layout', 'default'] },
                { id: 'rwl-toggle-enabled', label: () => _('Enable/Disable Responsive Window Layout'), keywords: ['enable', 'disable', 'responsive'] },
                { id: 'rwl-snap-toggle', label: () => _('Enable/Disable Snap Layout'), keywords: ['snap', 'edge', 'quarter', 'half', 'drag'] },
            ],
            contentPath: 'controlpanel/programs/responsivelayout.content.js',
            renderExport: 'render',
        },
    });
}
