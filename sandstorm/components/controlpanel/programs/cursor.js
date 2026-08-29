/**
 * @file controlpanel/programs/cursor.js
 * @description Manifest for the "Cursor" Control Panel tile.
 *
 * Boot-loaded — only registers the launcher-tile icon + `front`/`searchItems`
 * metadata. The actual panel content (engine on/off, pack/theme/size/
 * speed/smoothness, animation toggles, cursor-control Security sub-section)
 * lives in the sibling `cursor.content.js`, loaded on first open via
 * `panel.contentPath`.
 *
 * @module components/controlpanel/programs/cursor
 */

export function setup(os) {

    os.svg.global.load({
        id: "ic-cp-cursor",
        viewBox: "0 0 24 24",
        content: `<path fill="white" d="M6 2l14 8.5-6.1 1.7-1.7 6.1L6 2z"/>`,
    });

    os.controlpanel.add({
        front: {
            name: "cursor",
            icon: "#ic-cp-cursor",
            type: "svg",
            label: () => _("Cursor"),
            keywords: ["cursor", "mouse", "pointer", "muspekare"],
        },
        panel: {
            id: "cursor",
            name: () => _("Cursor"),
            searchItems: [
                { id: 'cursor-enabled-wrap', label: () => _('Use system cursor'), keywords: ['system', 'cursor', 'native', 'windows'] },
                { id: 'cursor-css-also-wrap', label: () => _('Enable CSS cursor'), keywords: ['css', 'cursor', 'hybrid'] },
                { id: 'cursor-pack-wrap', label: () => _('Cursor pack'), keywords: ['pack', 'style', 'cursor'] },
                { id: 'cursor-speed-wrap', label: () => _('Speed'), keywords: ['speed', 'cursor'] },
                { id: 'cursor-smoothness-wrap', label: () => _('Smoothness'), keywords: ['smoothness', 'cursor', 'motion'] },
                { id: 'cursor-size-wrap', label: () => _('Size'), keywords: ['size', 'cursor'] },
                { id: 'cursor-color-wrap', label: () => _('Color'), keywords: ['color', 'colour', 'cursor', 'theme'] },
                { id: 'cursor-anim-wrap', label: () => _('Animations'), keywords: ['animation', 'idle', 'busy', 'hover', 'click', 'trail'] },
                { id: 'cursor-security-wrap', label: () => _('Cursor permissions security'), keywords: ['security', 'permission', 'behörighet', 'cursor'] },
            ],
            contentPath: 'controlpanel/programs/cursor.content.js',
            renderExport: 'render',
        },
    });
}

export function start() { }
