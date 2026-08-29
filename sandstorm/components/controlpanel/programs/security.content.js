/**
 * @file controlpanel/programs/security.content.js
 * @description Security panel content: list of every program that has ever
 * requested cursor control, its current decision, and per-row actions —
 * lazy-loaded on first open via `security.js`'s `panel.contentPath`.
 *
 * Reads/writes exclusively through `app.cursor.permission.{list,set,reset}`
 * (the "cursor-control" scope) — this file has no direct import of
 * `cursor/permission.js`, matching the rest of the OS's convention that
 * feature internals are only ever reached through their own public API.
 *
 * Trust-model caveat (documented here as it's user-facing): this is
 * consent/auditability UX, like a browser's camera/mic permission list, not a
 * hard security boundary — this codebase has no real process isolation
 * between programs.
 *
 * @module components/controlpanel/programs/security.content
 */

const _CSS = `
.cursor-perm-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0; gap: 12px;
}
.cursor-perm-name { color: #fff; font-size: 13px; }
.cursor-perm-status { font-size: 12px; opacity: 0.85; margin-right: 12px; }
.cursor-perm-status.allowed { color: #6fcf6f; }
.cursor-perm-status.denied { color: #ff6b6b; }
.cursor-perm-actions { display: flex; gap: 6px; }
.cursor-perm-empty { color: rgba(255,255,255,0.55); font-size: 13px; padding: 12px 0; }
`;

export function setup(os) {
    os.addCSS('cp-security', _CSS);
}

function _renderRows() {
    const rows = app.cursor.permission.list("cursor-control");
    if (!rows.length) {
        return `<div class="cursor-perm-empty">${_('No program has requested cursor control yet.')}</div>`;
    }
    return rows.map(({ programId, decision }) => {
        const name = app.program?.getInfo?.(programId)?.name || programId;
        const allowed = decision === 'allow-always';
        const statusLabel = allowed ? _('Allowed') : _('Denied');
        const statusClass = allowed ? 'allowed' : 'denied';
        return `
            <div class="cursor-perm-row" data-program="${programId}">
                <div class="cursor-perm-name">${app.util.escapeHtml(name)}</div>
                <div style="display:flex;align-items:center;">
                    <span class="cursor-perm-status ${statusClass}">${statusLabel}</span>
                    <div class="cursor-perm-actions">
                        <div class="aero-button cursor-perm-allow">${_('Allow')}</div>
                        <div class="aero-button cursor-perm-deny">${_('Deny')}</div>
                        <div class="aero-button cursor-perm-remove">${_('Remove')}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

export function render(os) {
    const layout = {
        container: {
            className: "cp-customizer",
            style: "margin-right:20px;padding:28px;display:flex;justify-content:center;overflow-y:auto;height:max-content;",
            subs: [{
                block: {
                    style: "max-width:1024px;width:100%;",
                    subs: [
                        { block: { className: "h1", html: _("Security") } },
                        { block: { className: "p", html: _("Manage which programs are allowed to control the cursor") } },
                        { block: { className: "line" } },
                        { block: { className: "h2", html: _("Permissions") } },
                        { block: { className: "p", html: _("Cursor") } },
                        {
                            block: {
                                id: 'security-cursor-perms-wrap',
                                search: { label: () => _('Cursor permissions'), keywords: ['cursor', 'permission', 'behörighet'] },
                                html: `<div id="cursor-perm-list">${_renderRows()}</div>`,
                            },
                        },
                    ],
                },
            }],
        },
    };

    const html = os.ui.body(layout, { programid: 'controlpanel', panelId: 'security' }).render();

    setTimeout(() => {
        const list = document.getElementById('cursor-perm-list');
        if (!list) return;

        list.addEventListener('click', (e) => {
            const row = e.target.closest('.cursor-perm-row');
            if (!row) return;
            const programId = row.dataset.program;

            if (e.target.closest('.cursor-perm-allow')) {
                app.cursor.permission.set(programId, 'allow-always');
            } else if (e.target.closest('.cursor-perm-deny')) {
                app.cursor.permission.set(programId, 'deny-always');
            } else if (e.target.closest('.cursor-perm-remove')) {
                app.cursor.permission.reset('cursor-control', programId);
            } else {
                return;
            }
            list.innerHTML = _renderRows();
        });
    }, 0);

    return html;
}
