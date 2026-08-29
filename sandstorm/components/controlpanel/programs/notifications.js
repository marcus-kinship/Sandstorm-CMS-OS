/**
 * @file controlpanel/programs/notifications.js
 * @description Manifest for the "Notifications" Control Panel tile.
 *
 * Boot-loaded — only registers the launcher-tile icon + `front`/`searchItems`
 * metadata. The actual panel content (poll interval, badge placement, global/
 * per-program notification-routing settings) lives in the sibling
 * `notifications.content.js`, loaded on first open via `panel.contentPath`.
 *
 * @module components/controlpanel/programs/notifications
 */

export function setup(os) {

    os.svg.global.load({
        id: "ic-cp-notifications",
        viewBox: "0 0 24 24",
        content: `<path fill="white" d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22zm7-6.4V11c0-3.34-1.78-6.14-5-6.88V3.2a2 2 0 1 0-4 0v.92C6.78 4.86 5 7.65 5 11v4.6L3 17.6V19h18v-1.4z"/>`,
    });

    os.controlpanel.add({
        front: {
            name: "notifications",
            icon: "#ic-cp-notifications",
            type: "svg",
            label: () => _("Notifications"),
            keywords: ["notifications", "aviseringar", "bell", "notiser"],
        },
        panel: {
            id: "notifications",
            name: () => _("Notifications"),
            searchItems: [
                { id: 'notif-poll-wrap', label: () => _('Poll interval'), keywords: ['poll', 'interval', 'hämtning'] },
                { id: 'notif-placement-wrap', label: () => _('Placement'), keywords: ['placement', 'placering', 'position'] },
                { id: 'notif-progmode-wrap', label: () => _('Program notifications'), keywords: ['program', 'aviseringar', 'permission'] },
            ],
            contentPath: 'controlpanel/programs/notifications.content.js',
            renderExport: 'render',
        },
    });
}

export function start() { }
