/**
 * @file controlpanel/programs/users.js
 * @description Manifest for the Users / Account panel.
 *
 * Boot-loaded — registers the launcher-tile icon, the `front`/`searchItems`
 * metadata `os.controlpanel.add()` needs synchronously, AND
 * `app.users.openCP()`/`app.users.startMenuUsersTab()`. Those two stay here
 * (not in the lazy content module) because `startmenu/tabs.js` calls
 * `app.users.startMenuUsersTab()` whenever the Start Menu's Account tab
 * renders — which can happen before the user has ever opened Control Panel,
 * so this part of the file is boot-critical system integration, not panel
 * content. The rest of the panel (avatar helpers, mail accounts, the actual
 * render/bind logic, the Add User dialog) lives in the sibling
 * `users.content.js`, loaded on first open via `panel.contentPath`.
 *
 * @module components/controlpanel/programs/users
 */

export function setup(os) {

    os.svg.global.load({
        id: 'ic-cp-user',
        viewBox: '0 0 24 24',
        content: `<path fill="white" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>`
    });

    // ── App namespace ─────────────────────────────────────────────────────────

    if (!window.app.users) window.app.users = {};

    app.users.openCP = function () {
        app.controlpanel.window.users();
    };

    // ── Startmenu tab data ────────────────────────────────────────────────────

    app.users.startMenuUsersTab = function () {
        return {
            title:    _('Account'),
            icontype: 'svg',
            icon:     '#ic-cp-user',
            tab: function () {
                const initials = app.getUserInitials?.() || '?';
                return `
                    <div class="pd" style="padding-top:18px;padding-bottom:18px;color:var(--theme-fontcolor,#fff);">
                        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:14px;border-radius:10px;background:var(--theme-backgruondcolorc,#00000040);">
                            <div style="width:42px;height:42px;border-radius:50%;background:var(--theme-backgruondcolorc,#00000040);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0;">${initials}</div>
                            <div>
                                <div style="font-weight:600;font-size:13px;">${_('My Account')}</div>
                                <div style="font-size:11px;opacity:0.6;margin-top:2px;">Sandstorm CMS</div>
                            </div>
                        </div>
                        <button class="aero-button" id="sm-users-manage" style="font-size:11px;width:100%;">
                            ${_('Manage account')}
                            <div class="after pulse"></div>
                        </button>
                    </div>
                `;
            },
            callback: function () {
                const $btn = $('#sm-users-manage');
                if (!$btn.length) return;
                $btn.on('click', function () {
                    app.users.openCP();
                });
            }
        };
    };

    // ── Control panel tab ─────────────────────────────────────────────────────

    os.controlpanel.add({
        front: {
            name:     'users',
            icon:     '#ic-cp-user',
            type:     'svg',
            label:    () => _('Users'),
            keywords: ['users', 'account', 'profile', 'login', 'password', 'my account']
        },
        panel: {
            id:   'users',
            name: () => _('Users'),
            searchItems: [
                { id: 'users-my-account',      label: () => _('My Account'),      description: () => _('Edit profile and display name'), keywords: ['my account', 'profile', 'name', 'edit', 'account', 'display name'] },
                { id: 'users-change-password', label: () => _('Change password'),  keywords: ['password', 'change password', 'security', 'old password', 'new password'] },
                { id: 'users-add-user',        label: () => _('Add user'),         keywords: ['add user', 'new user', 'create user', 'register'] },
                { id: 'users-all-users',       label: () => _('All Users'),        description: () => _('Manage system users'), keywords: ['all users', 'users', 'manage', 'accounts', 'list'] },
            ],
            contentPath: 'controlpanel/programs/users.content.js',
            renderExport: 'render',
        }
    });
}

export function start() {}
