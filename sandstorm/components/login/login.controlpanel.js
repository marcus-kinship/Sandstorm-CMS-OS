/**
 * @file login/login.controlpanel.js
 * @description Manifest for the "Inloggning" (Login) Control Panel tile.
 *
 * Boot-loaded via `load.js`'s `controlpanelPrograms` list — NOT
 * self-registered from `login.js`'s own `setup()`, because that runs later,
 * inside the `start:` array, after load.js's BOOT API CLEANUP has already
 * replaced `os.controlpanel.add` with a locked no-op. Registers
 * unconditionally at boot, independent of whether the login program itself
 * is currently enabled in index.html's `start:` array.
 *
 * Only registers the launcher-tile icon + `front`/`searchItems` metadata —
 * the actual panel content lives in the sibling `login.content.js`, loaded
 * on first open via `panel.contentPath`.
 *
 * @module components/login/login.controlpanel
 */

export function setup(os) {

    os.svg.global.load({
        id: "ic-cp-login",
        viewBox: "0 0 24 24",
        content: `<path fill="white" d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 0 1 6 0zm-3 5a2 2 0 0 1 1 3.73V19a1 1 0 0 1-2 0v-1.27A2 2 0 0 1 12 14z"/>`,
    });

    os.controlpanel.add({
        front: {
            name: "login",
            icon: "#ic-cp-login",
            type: "svg",
            label: () => _("Login"),
            keywords: ["login", "inloggning", "lock", "timeout", "language", "background"],
        },
        panel: {
            id: "login",
            name: () => _("Login"),
            searchItems: [
                { id: 'login-cp-language-wrap', label: () => _('Language'), keywords: ['language', 'locale', 'login'] },
                { id: 'login-cp-timeout-wrap', label: () => _('Automatic timeout'), keywords: ['timeout', 'lock', 'idle', 'auto-lock'] },
                { id: 'login-bg-image-wrap', label: () => _('Background image'), keywords: ['background', 'image', 'wallpaper', 'login'] },
            ],
            contentPath: 'login/login.content.js',
            renderExport: 'render',
        },
    });
}

export function start() { }
