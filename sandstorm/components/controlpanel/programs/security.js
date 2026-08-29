/**
 * @file controlpanel/programs/security.js
 * @description Manifest for the "Security" Control Panel tile —
 * `Kontrollpanelen → Säkerhet → Behörigheter → Cursor`.
 *
 * Boot-loaded — only registers the launcher-tile icon + `front`/`searchItems`
 * metadata. The actual panel content (the per-program cursor-permission
 * list) lives in the sibling `security.content.js`, loaded on first open via
 * `panel.contentPath`.
 *
 * @module components/controlpanel/programs/security
 */

export function setup(os) {

    os.svg.global.load({
        id: "ic-cp-security",
        viewBox: "0 0 24 24",
        content: `<path fill="white" d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>`,
    });

    os.controlpanel.add({
        front: {
            name: "security",
            icon: "#ic-cp-security",
            type: "svg",
            label: () => _("Security"),
            keywords: ["security", "permissions", "behörigheter", "cursor"],
        },
        panel: {
            id: "security",
            name: () => _("Security"),
            searchItems: [
                { id: 'security-cursor-perms-wrap', label: () => _('Cursor permissions'), keywords: ['cursor', 'permission', 'behörighet', 'security'] },
            ],
            contentPath: 'controlpanel/programs/security.content.js',
            renderExport: 'render',
        },
    });
}

export function start() { }
