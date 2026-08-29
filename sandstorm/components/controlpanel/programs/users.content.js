/**
 * @file controlpanel/programs/users.content.js
 * @description Users / Account panel content (My Account, Mail, All Users
 * tabs + Add User dialog) — lazy-loaded on first open via `users.js`'s
 * `panel.contentPath`.
 *
 * @module components/controlpanel/programs/users.content
 */

// ── Avatar helpers ────────────────────────────────────────────────────────

const AVATAR_COLORS = [
    '#3b82f6','#8b5cf6','#ec4899','#ef4444',
    '#f97316','#eab308','#22c55e','#14b8a6'
];

function _avatarBg(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function _initials(u) {
    const parts = (u.name || u.username || '?').trim().split(/\s+/);
    return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : (parts[0][0] || '?').toUpperCase();
}

const MAX_AVATAR_DATA_URL_CHARS = 1_400_000;
const MAX_AVATAR_FILE_BYTES = 1_000_000;

function _isSafeAvatarUrl(url) {
    if (typeof url !== 'string' || url.length > MAX_AVATAR_DATA_URL_CHARS) return false;
    const m = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(url);
    return !!m && m[2].length % 4 === 0;
}

function _avatarHTML(u, size = 40) {
    const initials = _initials(u);
    const bg = u.avatar || _avatarBg(u.username || u.name || '?');
    const fs = Math.round(size * 0.38);
    if (u.avatarUrl && _isSafeAvatarUrl(u.avatarUrl)) {
        return `<img src="${app.util.escapeHtml(u.avatarUrl)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;" />`;
    }
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:#fff;flex-shrink:0;">${initials}</div>`;
}

// ── Shared field row ──────────────────────────────────────────────────────

// This file builds its markup as plain template-literal HTML strings (not
// the os.ui.body({...}) DSL tree core.content.js/system.content.js/
// update.content.js use), so a single os.ui.label() row is rendered here to
// an HTML string via os.ui.body(...).render() and inlined directly —
// avoiding a wider rewrite of this file's rendering approach while still
// using the one shared row component instead of this file's own hand-built
// .cp-field/.cp-label markup. NOTE: os.ui.label()'s row lays label and
// field out side by side (`.ui-label-row` is `display:flex`, label fixed at
// 140px), whereas this file's old .cp-field was `flex-direction:column`
// (label stacked above the field) — this is a genuine, visible layout
// change for every field converted below, not just an internal cleanup.
// Composite rows that pack more than one labeled control into a single row
// (the mail form's Server+Port+SSL groups) don't fit this one-label/
// one-field shape and were deliberately left as hand-built markup.
function _fieldRow(label, forId, fieldHtml) {
    return app.ui.body(app.ui.label(label, forId, fieldHtml)).render();
}

// ── Users list from config ────────────────────────────────────────────────

function _getUsers() {
    return app.config?.users || [];
}

function _getCurrentUser() {
    return app.config?.user || {};
}

// ── Panel entry point ─────────────────────────────────────────────────────

export function render(os) {
    os.ui.body({
        container: { subs: [
            { block: { id: 'users-my-account',     search: { label: () => _('My Account'),      description: () => _('Edit profile and display name'), keywords: ['my account', 'profile', 'name', 'edit', 'account', 'display name'] } } },
            { block: { id: 'users-change-password', search: { label: () => _('Change password'), keywords: ['password', 'change password', 'security', 'old password', 'new password'] } } },
            { block: { id: 'users-add-user',       search: { label: () => _('Add user'),        keywords: ['add user', 'new user', 'create user', 'register'] } } },
            { block: { id: 'users-all-users',      search: { label: () => _('All Users'),       description: () => _('Manage system users'), keywords: ['all users', 'users', 'manage', 'accounts', 'list'] } } },
        ]}
    }, { programid: 'controlpanel', panelId: 'users' }).render();

    const html = `
    <div style="display:flex;flex-direction:column;height:100%;box-sizing:border-box;">

      <!-- Inner tab bar -->
      <div style="display:flex;gap:2px;padding:10px 20px 0;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
        <button class="cp-users-inner-tab active" data-tab="me" style="padding:7px 16px;background:none;border:none;color:#fff;font-size:12px;border-radius:6px 6px 0 0;cursor:default;opacity:1;transition:background 0.2s,opacity 0.2s;">${_('My Account')}</button>
        <button class="cp-users-inner-tab" data-tab="mail" style="padding:7px 16px;background:none;border:none;color:#fff;font-size:12px;border-radius:6px 6px 0 0;cursor:default;opacity:0.55;transition:background 0.2s,opacity 0.2s;">${_('Mail')}</button>
        <button class="cp-users-inner-tab" data-tab="list" style="padding:7px 16px;background:none;border:none;color:#fff;font-size:12px;border-radius:6px 6px 0 0;cursor:default;opacity:0.55;transition:background 0.2s,opacity 0.2s;">${_('All Users')}</button>
      </div>

      <!-- Tab: My Account -->
      <div class="cp-users-tab-pane" data-pane="me" style="flex:1;overflow-y:auto;padding:28px;">
        ${_renderMyAccount()}
      </div>

      <!-- Tab: Mail -->
      <div class="cp-users-tab-pane" data-pane="mail" style="flex:1;overflow-y:auto;padding:28px;display:none;">
        ${_renderMailSettings()}
      </div>

      <!-- Tab: All Users -->
      <div class="cp-users-tab-pane" data-pane="list" style="flex:1;overflow-y:auto;padding:28px;display:none;">
        ${_renderUserList()}
      </div>

    </div>`;

    setTimeout(() => _bindUsersPanel(), 0);
    return html;
}

// ── Render: My Account tab ────────────────────────────────────────────────

function _renderMyAccount() {
    const cu      = _getCurrentUser();
    const profile = cu?.profile || {};
    const initials = app.getUserInitials?.() || '?';
    const role    = cu?.role || 'standard';
    const roleLabel = role === 'admin' || role === 'administrator' ? _('Administrator') : _('Standard');

    return `
        <div style="max-width:580px;">
            <div class="h1">${_('My Account')}</div>
            <div class="p">${_('Manage your personal account')}</div>
            <div class="line"></div>

            <div style="display:flex;align-items:center;gap:16px;padding:18px;border-radius:10px;background:var(--theme-backgruondcolorc,#00000040);margin-bottom:24px;">
                <div style="width:56px;height:56px;border-radius:50%;background:var(--theme-backgruondcolorc,#00000040);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;flex-shrink:0;">${initials}</div>
                <div>
                    <div class="cp-label" style="font-size:14px;letter-spacing:0;text-transform:none;">${profile.name ? profile.name + ' ' + (profile.lastname || '') : _('My Account')}</div>
                    <div style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:${role === 'admin' || role === 'administrator' ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.1)'};color:${role === 'admin' || role === 'administrator' ? '#93c5fd' : 'rgba(255,255,255,0.7)'};">${roleLabel}</div>
                </div>
            </div>

            <div class="cp-label" style="margin-bottom:12px;">${_('Edit profile')}</div>

            ${_fieldRow(_('Display name'), 'cp-users-name-input',
                `<input class="def" type="text" id="cp-users-name-input" value="${profile.name || ''}" placeholder="${_('Enter display name')}" style="max-width:280px;" />`
            )}

            <div style="margin-bottom:28px;">
                <button class="aero-button" id="cp-users-edit-save">
                    ${_('Update')}
                    <div class="after pulse"></div>
                </button>
            </div>

            <div class="line"></div>
            <div class="cp-label" style="margin-bottom:12px;">${_('Change password')}</div>

            ${_fieldRow(_('Current password'), 'cp-users-pw-old',
                `<input class="def" type="password" id="cp-users-pw-old" placeholder="${_('Current password')}" style="max-width:280px;" />`
            )}
            ${_fieldRow(_('New password'), 'cp-users-pw-new',
                `<input class="def" type="password" id="cp-users-pw-new" placeholder="${_('New password')}" style="max-width:280px;" />`
            )}
            ${_fieldRow(_('Confirm new password'), 'cp-users-pw-confirm',
                `<input class="def" type="password" id="cp-users-pw-confirm" placeholder="${_('Confirm new password')}" style="max-width:280px;" />`
            )}

            <div id="cp-users-pw-msg" style="display:none;font-size:11px;margin-bottom:12px;padding:8px 12px;border-radius:6px;background:var(--theme-backgruondcolorc,#00000040);"></div>

            <div>
                <button class="aero-button" id="cp-users-pw-save">
                    ${_('Update')}
                    <div class="after pulse"></div>
                </button>
            </div>
        </div>`;
}

// ── Mail accounts helpers ─────────────────────────────────────────────────

function _getMailAccounts() {
    return app.config?.mailAccounts || [];
}

function _saveMailAccounts(accounts) {
    if (!app.config) app.config = {};
    app.config.mailAccounts = accounts;
    app.api?.post('/api/settings/mail', { accounts });
}

function _mailCardHTML(acc, i) {
    const type    = acc.incoming?.type || 'IMAP';
    const color   = type === 'POP3' ? '#fb923c' : '#60a5fa';
    const bg      = type === 'POP3' ? 'rgba(251,146,60,0.15)' : 'rgba(96,165,250,0.15)';
    return `
    <div class="cp-mail-card" data-mail-idx="${i}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;background:var(--theme-backgruondcolorc,#00000040);margin-bottom:8px;">
        <div style="width:38px;height:38px;border-radius:8px;background:${bg};border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:${color};flex-shrink:0;letter-spacing:0.5px;">${type}</div>
        <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;">${acc.name || acc.email || _('Unnamed')}</div>
            <div style="font-size:11px;opacity:0.55;margin-top:2px;">${acc.email || ''}</div>
        </div>
        <button class="cp-mail-edit-btn" data-mail-idx="${i}" style="background:none;border:none;cursor:default;color:rgba(255,255,255,0.45);font-size:11px;padding:4px 8px;border-radius:6px;transition:color 0.15s,background 0.15s;" onmouseover="this.style.color='#fff';this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.color='rgba(255,255,255,0.45)';this.style.background='none'">${_('Edit')}</button>
        <button class="cp-mail-remove-btn" data-mail-idx="${i}" style="background:none;border:none;cursor:default;color:rgba(255,255,255,0.35);font-size:16px;line-height:1;padding:4px 6px;border-radius:6px;transition:color 0.15s,background 0.15s;" onmouseover="this.style.color='#f87171';this.style.background='rgba(248,113,113,0.12)'" onmouseout="this.style.color='rgba(255,255,255,0.35)';this.style.background='none'">✕</button>
    </div>`;
}

function _refreshMailList() {
    const listEl = document.getElementById('cp-mail-list');
    if (!listEl) return;
    const accounts = _getMailAccounts();
    listEl.innerHTML = accounts.length
        ? accounts.map((acc, i) => _mailCardHTML(acc, i)).join('')
        : `<div style="padding:32px 0;opacity:0.4;text-align:center;font-size:12px;">${_('No mail accounts configured')}</div>`;
}

function _openMailForm(idx) {
    const formEl    = document.getElementById('cp-mail-form');
    const titleEl   = document.getElementById('cp-mail-form-title');
    if (!formEl) return;
    document.getElementById('cp-mail-form-idx').value = idx;
    titleEl.textContent = idx === -1 ? _('New mail account') : _('Edit mail account');

    const acc = idx === -1 ? null : _getMailAccounts()[idx];
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    const chk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

    set('cp-mail-name',       acc?.name       || '');
    set('cp-mail-email',      acc?.email      || '');
    set('cp-mail-in-type',    acc?.incoming?.type   || 'IMAP');
    set('cp-mail-in-server',  acc?.incoming?.server || '');
    set('cp-mail-in-port',    acc?.incoming?.port   ?? 993);
    chk('cp-mail-in-ssl',     acc ? acc.incoming?.ssl !== false : true);
    set('cp-mail-in-user',    acc?.incoming?.username || '');
    set('cp-mail-in-pass',    acc?.incoming?.password || '');
    set('cp-mail-out-server', acc?.outgoing?.server   || '');
    set('cp-mail-out-port',   acc?.outgoing?.port     ?? 587);
    chk('cp-mail-out-ssl',    acc?.outgoing?.ssl === true);
    set('cp-mail-out-user',   acc?.outgoing?.username || '');
    set('cp-mail-out-pass',   acc?.outgoing?.password || '');

    formEl.style.display = '';
    formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _saveMailFormData() {
    const idx = parseInt(document.getElementById('cp-mail-form-idx').value);
    const get = id => document.getElementById(id)?.value.trim() || '';
    const chk = id => document.getElementById(id)?.checked === true;

    const email = get('cp-mail-email');
    if (!email) {
        const formEl = document.getElementById('cp-mail-form');
        if (formEl) {
            let errEl = formEl.querySelector('.cp-mail-err');
            if (!errEl) { errEl = document.createElement('div'); errEl.className = 'cp-mail-err'; errEl.style.cssText = 'font-size:11px;color:#f87171;margin-bottom:10px;'; formEl.querySelector('#cp-mail-form-save')?.before(errEl); }
            errEl.textContent = _('Email address is required');
        }
        return;
    }

    const accounts = _getMailAccounts();
    const existing = idx >= 0 ? accounts[idx] : null;
    const account = {
        id:       existing?.id || 'mail-' + Date.now(),
        name:     get('cp-mail-name') || email,
        email,
        incoming: {
            type:     document.getElementById('cp-mail-in-type')?.value || 'IMAP',
            server:   get('cp-mail-in-server'),
            port:     parseInt(document.getElementById('cp-mail-in-port')?.value) || 993,
            ssl:      chk('cp-mail-in-ssl'),
            username: get('cp-mail-in-user'),
            password: document.getElementById('cp-mail-in-pass')?.value || '',
        },
        outgoing: {
            server:   get('cp-mail-out-server'),
            port:     parseInt(document.getElementById('cp-mail-out-port')?.value) || 587,
            ssl:      chk('cp-mail-out-ssl'),
            username: get('cp-mail-out-user'),
            password: document.getElementById('cp-mail-out-pass')?.value || '',
        }
    };

    if (idx === -1) accounts.push(account);
    else accounts[idx] = account;
    _saveMailAccounts(accounts);
    _refreshMailList();
    document.getElementById('cp-mail-form').style.display = 'none';
}

// ── Render: Mail Settings tab ─────────────────────────────────────────────

function _renderMailSettings() {
    const accounts = _getMailAccounts();
    const cards = accounts.map((acc, i) => _mailCardHTML(acc, i)).join('');
    const empty = accounts.length === 0
        ? `<div style="padding:32px 0;opacity:0.4;text-align:center;font-size:12px;">${_('No mail accounts configured')}</div>`
        : '';

    return `
        <div style="max-width:600px;">
            <div class="h1">${_('Mail Accounts')}</div>
            <div class="p">${_('Configure IMAP and POP3 mail accounts')}</div>
            <div class="line"></div>

            <div id="cp-mail-list">${cards}${empty}</div>

            <div style="margin-top:16px;">
                <button class="aero-button" id="cp-mail-add-btn">${_('Add account')}<div class="after pulse"></div></button>
            </div>

            <!-- Inline add / edit form -->
            <div id="cp-mail-form" style="display:none;margin-top:20px;padding:20px;border-radius:10px;background:var(--theme-backgruondcolorc,#00000040);">
                <input type="hidden" id="cp-mail-form-idx" value="-1" />
                <div class="cp-label" style="font-size:13px;margin-bottom:16px;" id="cp-mail-form-title">${_('New mail account')}</div>

                ${_fieldRow(_('Account name'), 'cp-mail-name',
                    `<input class="def" type="text" id="cp-mail-name" placeholder="${_('e.g. Work Gmail')}" style="max-width:280px;" />`
                )}
                ${_fieldRow(_('Email address'), 'cp-mail-email',
                    `<input class="def" type="email" id="cp-mail-email" placeholder="user@example.com" style="max-width:280px;" />`
                )}

                <div class="line" style="margin:16px 0;"></div>
                <div class="cp-label" style="margin-bottom:12px;">${_('Incoming mail server')}</div>

                ${_fieldRow(_('Type'), 'cp-mail-in-type',
                    `<select id="cp-mail-in-type" style="background:var(--theme-backgruondcolorc,#00000040);color:#fff;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:6px 8px;font-size:12px;cursor:default;max-width:120px;">
                        <option value="IMAP">IMAP</option>
                        <option value="POP3">POP3</option>
                    </select>`
                )}
                <div class="cp-field" style="flex-direction:row;align-items:flex-end;gap:10px;">
                    <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
                        <span class="cp-label">${_('Server')}</span>
                        <input class="def" type="text" id="cp-mail-in-server" placeholder="imap.example.com" />
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <span class="cp-label">${_('Port')}</span>
                        <input class="def" type="number" id="cp-mail-in-port" value="993" style="max-width:90px;" />
                    </div>
                    <label style="font-size:12px;opacity:0.7;display:flex;align-items:center;gap:6px;cursor:default;padding-bottom:6px;">
                        <input type="checkbox" id="cp-mail-in-ssl" checked style="cursor:default;" /> SSL/TLS
                    </label>
                </div>
                ${_fieldRow(_('Username'), 'cp-mail-in-user',
                    `<input class="def" type="text" id="cp-mail-in-user" placeholder="user@example.com" style="max-width:280px;" />`
                )}
                ${_fieldRow(_('Password'), 'cp-mail-in-pass',
                    `<input class="def" type="password" id="cp-mail-in-pass" placeholder="••••••••" style="max-width:280px;" />`
                )}

                <div class="line" style="margin:16px 0;"></div>
                <div class="cp-label" style="margin-bottom:12px;">${_('Outgoing mail server (SMTP)')}</div>

                <div class="cp-field" style="flex-direction:row;align-items:flex-end;gap:10px;">
                    <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
                        <span class="cp-label">${_('Server')}</span>
                        <input class="def" type="text" id="cp-mail-out-server" placeholder="smtp.example.com" />
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <span class="cp-label">${_('Port')}</span>
                        <input class="def" type="number" id="cp-mail-out-port" value="587" style="max-width:90px;" />
                    </div>
                    <label style="font-size:12px;opacity:0.7;display:flex;align-items:center;gap:6px;cursor:default;padding-bottom:6px;">
                        <input type="checkbox" id="cp-mail-out-ssl" style="cursor:default;" /> SSL/TLS
                    </label>
                </div>
                ${_fieldRow(_('Username'), 'cp-mail-out-user',
                    `<input class="def" type="text" id="cp-mail-out-user" placeholder="user@example.com" style="max-width:280px;" />`
                )}
                ${_fieldRow(_('Password'), 'cp-mail-out-pass',
                    `<input class="def" type="password" id="cp-mail-out-pass" placeholder="••••••••" style="max-width:280px;" />`
                )}

                <div style="display:flex;gap:10px;margin-top:20px;">
                    <button class="aero-button" id="cp-mail-form-save">${_('Save')}<div class="after pulse"></div></button>
                    <button class="aero-button" id="cp-mail-form-cancel" style="opacity:0.7;">${_('Cancel')}<div class="after pulse"></div></button>
                </div>
            </div>
        </div>`;
}

// ── Render: All Users tab ─────────────────────────────────────────────────

function _renderUserList() {
    const users = _getUsers();
    const cu    = _getCurrentUser();

    const cards = users.map(u => {
        const isSelf    = u.username === cu?.username || u.id === cu?.id;
        const role      = u.role || 'standard';
        const roleLabel = role === 'admin' || role === 'administrator' ? _('Administrator') : _('Standard');
        const roleColor = role === 'admin' || role === 'administrator' ? '#93c5fd' : 'rgba(255,255,255,0.6)';
        const roleBg    = role === 'admin' || role === 'administrator' ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.08)';
        const uid       = u.id || u.username;
        const safeUid      = app.util.escapeHtml(uid);
        const safeName     = app.util.escapeHtml(u.name || u.username);
        const safeUsername = app.util.escapeHtml(u.username || '');
        return `
        <div class="cp-user-card" data-uid="${safeUid}" style="display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:10px;background:var(--theme-backgruondcolorc,#00000040);margin-bottom:8px;transition:background 0.2s;">
            ${_avatarHTML(u, 44)}
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;">
                    ${safeName}
                    ${isSelf ? `<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:rgba(255,255,255,0.1);font-weight:500;opacity:0.7;">${_('You')}</span>` : ''}
                </div>
                <div style="font-size:11px;opacity:0.55;margin-top:2px;">@${safeUsername}</div>
            </div>
            <span style="font-size:10px;font-weight:600;padding:3px 10px;border-radius:10px;background:${roleBg};color:${roleColor};flex-shrink:0;">${roleLabel}</span>
            ${!isSelf ? `<button class="cp-user-remove-btn" data-uid="${safeUid}" title="${_('Remove user')}" style="margin-left:8px;background:none;border:none;cursor:default;color:rgba(255,255,255,0.35);font-size:16px;line-height:1;padding:4px 6px;border-radius:6px;transition:color 0.15s,background 0.15s;" onmouseover="this.style.color='#f87171';this.style.background='rgba(248,113,113,0.12)'" onmouseout="this.style.color='rgba(255,255,255,0.35)';this.style.background='none'">✕</button>` : `<div style="width:28px;flex-shrink:0;"></div>`}
        </div>`;
    }).join('');

    const empty = users.length === 0
        ? `<div style="padding:32px 0;opacity:0.4;text-align:center;font-size:12px;">${_('No users found')}</div>`
        : '';

    return `
        <div style="max-width:580px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                <div class="h1" style="margin:0;">${_('All Users')}</div>
                <button class="aero-button confirm" id="cp-users-add-btn" style="margin:0;">
                    ${_('Add user')}
                    <div class="after pulse"></div>
                </button>
            </div>
            <div class="p">${_('Users configured in this system')}</div>
            <div class="line"></div>
            <div id="cp-users-list-body">
                ${cards}${empty}
            </div>
        </div>`;
}

// ── Bind panel events ─────────────────────────────────────────────────────

function _bindUsersPanel() {
    // Inner tab switching
    document.querySelectorAll('.cp-users-inner-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.cp-users-inner-tab').forEach(b => {
                b.classList.toggle('active', b === btn);
                b.style.opacity = b === btn ? '1' : '0.55';
                b.style.background = b === btn ? 'var(--theme-backgruondcolorc,#00000040)' : 'none';
            });
            document.querySelectorAll('.cp-users-tab-pane').forEach(p => {
                p.style.display = p.dataset.pane === tab ? '' : 'none';
            });
        });
    });

    // My Account — save name
    $('#cp-users-edit-save').on('click', function () {
        const nameEl = $('#cp-users-name-input')[0];
        if (!nameEl?.value.trim()) return;
        this.disabled = true;
        const orig = this.firstChild.textContent.trim();
        this.firstChild.textContent = _('Saved');
        app.api?.post('/api/users/update', { name: nameEl.value.trim() });
        setTimeout(() => {
            this.firstChild.textContent = orig;
            this.disabled = false;
        }, 1500);
    });

    // My Account — change password
    $('#cp-users-pw-save').on('click', function () {
        const oldEl  = $('#cp-users-pw-old')[0];
        const newEl  = $('#cp-users-pw-new')[0];
        const confEl = $('#cp-users-pw-confirm')[0];
        const msg    = $('#cp-users-pw-msg')[0];
        if (!oldEl?.value || !newEl?.value) return;
        if (newEl.value !== confEl?.value) {
            if (msg) { msg.style.display = 'block'; msg.style.color = '#f87171'; msg.textContent = _('Passwords do not match'); }
            return;
        }
        this.disabled = true;
        if (msg) msg.style.display = 'none';
        const orig = this.firstChild.textContent.trim();
        this.firstChild.textContent = _('Saved');
        app.api?.post('/api/users/password', { oldPassword: oldEl.value, newPassword: newEl.value });
        setTimeout(() => {
            if (oldEl)  oldEl.value  = '';
            if (newEl)  newEl.value  = '';
            if (confEl) confEl.value = '';
            this.firstChild.textContent = orig;
            this.disabled = false;
        }, 1500);
    });

    // ── Mail tab bindings ─────────────────────────────────────────────────

    $('#cp-mail-add-btn').on('click', () => _openMailForm(-1));

    $('#cp-mail-list').on('click', '.cp-mail-edit-btn', function () {
        _openMailForm(parseInt(this.dataset.mailIdx));
    });

    $('#cp-mail-list').on('click', '.cp-mail-remove-btn', function () {
        const idx      = parseInt(this.dataset.mailIdx);
        const accounts = _getMailAccounts();
        accounts.splice(idx, 1);
        _saveMailAccounts(accounts);
        _refreshMailList();
        document.getElementById('cp-mail-form').style.display = 'none';
    });

    $('#cp-mail-form-save').on('click', () => _saveMailFormData());
    $('#cp-mail-form-cancel').on('click', () => { document.getElementById('cp-mail-form').style.display = 'none'; });

    // Auto-update incoming port when type or SSL changes
    $(document).on('change', '#cp-mail-in-type, #cp-mail-in-ssl', () => {
        const type = $('#cp-mail-in-type').val();
        const ssl  = $('#cp-mail-in-ssl').prop('checked');
        const ports = type === 'POP3' ? [995, 110] : [993, 143];
        $('#cp-mail-in-port').val(ssl ? ports[0] : ports[1]);
    });

    // Auto-update outgoing port when SSL changes
    $(document).on('change', '#cp-mail-out-ssl', () => {
        $('#cp-mail-out-port').val($('#cp-mail-out-ssl').prop('checked') ? 465 : 587);
    });

    // ── All Users tab ─────────────────────────────────────────────────────

    // Add user button
    $('#cp-users-add-btn').on('click', () => {
        _openAddUserDialog();
    });

    // Remove user — event delegation on list body
    $('#cp-users-list-body').on('click', e => {
        const btn = e.target.closest('.cp-user-remove-btn');
        if (!btn) return;
        const uid  = btn.dataset.uid;
        const card = btn.closest('.cp-user-card');
        const name = card?.querySelector('div[style*="font-size:13px"]')?.firstChild?.textContent?.trim() || uid;
        if (!confirm(`${_('Remove')} "${name}"?`)) return;
        app.api?.post('/api/users/remove', { id: uid });
        if (app.config.users) {
            app.config.users = app.config.users.filter(u => (u.id || u.username) !== uid);
        }
        card?.remove();
        if (!document.querySelector('#cp-users-list-body .cp-user-card')) {
            const body = $('#cp-users-list-body')[0];
            if (body) body.innerHTML = `<div style="padding:32px 0;opacity:0.4;text-align:center;font-size:12px;">${_('No users found')}</div>`;
        }
    });
}

// ── Add User dialog ───────────────────────────────────────────────────────

const SECURITY_QUESTIONS = [
    _("What was the name of your first pet?"),
    _("What city were you born in?"),
    _("What is your mother's maiden name?"),
    _("What was the make of your first car?"),
    _("What elementary school did you attend?"),
    _("What is the name of your childhood best friend?"),
    _("What street did you grow up on?"),
    _("What is your oldest sibling's middle name?"),
];

function _questionOptions(selected = '') {
    return SECURITY_QUESTIONS.map(q =>
        `<option value="${q}"${q === selected ? ' selected' : ''}>${q}</option>`
    ).join('');
}

async function _openAddUserDialog() {
    try {
        if (!app.ui?.radio) {
            const mod = await app.includeModule(app.config.local.ComponentsRoot + 'ui/radio.js');
            if (mod?.setup) mod.setup(app);
        }
    } catch (err) {
        app.ui.alert({ title: _('Error'), message: String(err?.message || err), confirm: _('OK') });
        return;
    }

    if (typeof app.ui?.radio !== 'function') {
        app.ui.alert({ title: _('Error'), message: _('Could not load radio component'), confirm: _('OK') });
        return;
    }

    const uid = 'add-user-' + Date.now();

    try { app.ui.windowStart('controlpanel', {
        id:        uid,
        title:     _('Add User'),
        width:     '580px',
        height:    '600px',
        resizable: false,
        body(windowobj) {
            const selectedColor   = _avatarBg(String(Date.now()));
            let   selectedPhotoUrl = null;

            setTimeout(() => {
                const root = windowobj?.el?.[0] || document.querySelector(`#${(windowobj?.windowId || uid + '-0')}-win`);
                if (!root) return;

                // Bind glass radio buttons
                app.ui.radio.bind(root);

                // Update initials preview as name is typed
                function _updatePreview() {
                    if (selectedPhotoUrl) return;
                    const nameVal = root.querySelector('#add-user-name')?.value.trim() || '';
                    const parts   = nameVal.split(/\s+/).filter(Boolean);
                    const initials = parts.length >= 2
                        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                        : (parts[0]?.[0] || '?').toUpperCase();
                    const prev = root.querySelector('#add-user-avatar-preview');
                    if (prev) { prev.textContent = initials; prev.style.background = selectedColor; }
                }
                root.querySelector('#add-user-name')?.addEventListener('input', _updatePreview);

                // Photo upload
                root.querySelector('#add-user-photo-btn')?.addEventListener('click', () => {
                    root.querySelector('#add-user-photo-input')?.click();
                });
                root.querySelector('#add-user-photo-input')?.addEventListener('change', e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const msgEl = root.querySelector('#add-user-msg');
                    if (file.size > MAX_AVATAR_FILE_BYTES) {
                        e.target.value = '';
                        if (msgEl) {
                            msgEl.style.color = '#f87171';
                            msgEl.textContent = _('Photo is too large (max 1 MB)');
                            msgEl.style.display = 'block';
                        }
                        return;
                    }
                    if (msgEl) msgEl.style.display = 'none';
                    if (selectedPhotoUrl) URL.revokeObjectURL(selectedPhotoUrl);
                    selectedPhotoUrl = URL.createObjectURL(file);
                    const prev = root.querySelector('#add-user-avatar-preview');
                    if (prev) {
                        prev.style.background = 'none';
                        prev.innerHTML = `<img src="${selectedPhotoUrl}" style="width:52px;height:52px;object-fit:cover;border-radius:50%;">`;
                    }
                    root.querySelector('#add-user-photo-clear').style.display = '';
                });
                root.querySelector('#add-user-photo-clear')?.addEventListener('click', () => {
                    if (selectedPhotoUrl) { URL.revokeObjectURL(selectedPhotoUrl); selectedPhotoUrl = null; }
                    root.querySelector('#add-user-photo-input').value = '';
                    root.querySelector('#add-user-photo-clear').style.display = 'none';
                    _updatePreview();
                });

                // Cancel
                root.querySelector('#add-user-cancel')?.addEventListener('click', e => {
                    e.stopPropagation();
                    windowobj?.close?.();
                });

                // Save
                root.querySelector('#add-user-save')?.addEventListener('click', async e => {
                    e.stopPropagation();
                    const get = id => root.querySelector(`#${id}`)?.value?.trim() || '';
                    const name     = get('add-user-name');
                    const username = get('add-user-username');
                    const password = get('add-user-password');
                    const role     = app.ui.radio.getValue(root, 'add-user-role') || 'standard';
                    const sq = [1,2,3].map(i => ({
                        question: get(`add-user-sq${i}`),
                        answer:   get(`add-user-sa${i}`)
                    }));

                    const msgEl = root.querySelector('#add-user-msg');
                    if (!name || !username || !password) {
                        if (msgEl) { msgEl.style.color = '#f87171'; msgEl.textContent = _('Name, username and password are required'); msgEl.style.display = 'block'; }
                        return;
                    }

                    const saveBtn = root.querySelector('#add-user-save');
                    if (saveBtn) { saveBtn.disabled = true; saveBtn.firstChild.textContent = _('Saving…'); }

                    // Convert photo to base64 if one was selected
                    let avatarUrl = null;
                    const fileInput = root.querySelector('#add-user-photo-input');
                    const file = fileInput?.files?.[0];
                    if (file) {
                        avatarUrl = await new Promise(r => {
                            const rd = new FileReader();
                            rd.onload = ev => r(ev.target.result);
                            rd.readAsDataURL(file);
                        });
                    }

                    const payload = { name, username, password, role, avatar: selectedColor, avatarUrl, securityQuestions: sq };

                    app.api?.post('/api/users/add', payload)
                        ?.success?.(() => {
                            if (!app.config.users) app.config.users = [];
                            app.config.users.push(payload);
                            windowobj?.close?.();
                        })
                        ?.fail?.(() => {
                            if (!app.config.users) app.config.users = [];
                            app.config.users.push(payload);
                            windowobj?.close?.();
                        });
                });
            }, 0);

            return `
            <div style="padding:20px 24px;overflow-y:auto;height:100%;box-sizing:border-box;font-size:12px;color:#fff;">

              <!-- Avatar preview + photo upload -->
              <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
                <div id="add-user-avatar-preview" style="width:52px;height:52px;border-radius:50%;background:${selectedColor};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden;">?</div>
                <div>
                  <div style="font-size:11px;opacity:0.6;margin-bottom:8px;">${_('Profile picture')}</div>
                  <div style="display:flex;gap:8px;align-items:center;">
                    <button class="aero-button" id="add-user-photo-btn" type="button">
                      ${_('Choose image')}
                      <div class="after pulse"></div>
                    </button>
                    <button class="aero-button" id="add-user-photo-clear" type="button" style="display:none;">
                      ${_('Remove')}
                      <div class="after"></div>
                    </button>
                  </div>
                  <input type="file" id="add-user-photo-input" accept="image/*" style="display:none;">
                </div>
              </div>

              <!-- Role (glass radio) -->
              <div style="margin-bottom:16px;">
                <div style="opacity:0.65;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em; color: var(--theme-fontcolor);">${_('Role')}</div>
                ${app.ui.radio({ name: 'add-user-role', items: [
                    { value: 'administrator', label: _('Administrator') },
                    { value: 'standard',      label: _('Standard') }
                ], selected: 'standard' })}
              </div>

              <!-- Name -->
              <div class="input-def" style="margin-bottom:10px;">
                <input class="def" type="text" id="add-user-name" placeholder=" " />
                <label>${_('Name')}</label>
              </div>

              <!-- Username -->
              <div class="input-def" style="margin-bottom:10px;">
                <input class="def" type="text" id="add-user-username" placeholder=" " autocomplete="off" />
                <label>${_('Username')}</label>
              </div>

              <!-- Password -->
              <div class="input-def" style="margin-bottom:18px;">
                <input class="def" type="password" id="add-user-password" placeholder=" " autocomplete="new-password" />
                <label>${_('Password')}</label>
              </div>

              <!-- Security questions -->
              <div style="opacity:0.65;margin-bottom:8px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em; color: var(--theme-fontcolor);">${_('Security questions')}</div>

              ${[1,2,3].map(i => `
              <div style="margin-bottom:10px;padding:10px 12px;border-radius:8px;background:var(--theme-backgruondcolorc,#00000040);">
                <select class="def" id="add-user-sq${i}" style="margin-bottom:6px;">
                  ${_questionOptions()}
                </select>
                <div class="input-def" style="margin:0;">
                  <input class="def" type="text" id="add-user-sa${i}" placeholder=" " />
                  <label>${_('Answer')}</label>
                </div>
              </div>`).join('')}

              <!-- Messages -->
              <div id="add-user-msg" style="display:none;font-size:11px;padding:8px 10px;border-radius:6px;background:var(--theme-backgruondcolorc,#00000040);margin-bottom:10px;"></div>

              <!-- Actions -->
              <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;padding-bottom:8px;">
                <button class="aero-button" id="add-user-cancel">
                  ${_('Cancel')}
                  <div class="after"></div>
                </button>
                <button class="aero-button confirm" id="add-user-save">
                  ${_('Add User')}
                  <div class="after pulse"></div>
                </button>
              </div>

            </div>`;
        }
    }); } catch (err) {
        app.ui.alert({ title: _('Error'), message: String(err?.message || err), confirm: _('OK') });
    }
}
