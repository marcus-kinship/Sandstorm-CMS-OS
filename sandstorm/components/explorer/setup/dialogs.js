/**
 * @file explorer/setup/dialogs.js
 * @description The `app.explorer.windows` file-dialog API: `fileDialog()`
 * (and its `select.file`/`select.folder`/`save.file` shorthands), plus the
 * `dialog.openWith` and `dialog.attributes` (Properties) window builders.
 *
 * Exported `registerDialogs(os)`, called once from explorer/setup/index.js.
 * Split out of the original monolithic explorer/setup.js — moved verbatim,
 * no logic changes.
 *
 * @module components/explorer/setup/dialogs
 */
import { buildExpShell } from './shell.js';

/**
 * Registers `app.explorer.windows`.
 *
 * @param {Object} os - The OS/program API.
 * @returns {void}
 */
export function registerDialogs(os) {
    // ── File-dialog API ───────────────────────────────────────────────────────
    app.explorer._pendingDialog = null;

    app.explorer.windows = {
        buildShell: buildExpShell,

        fileDialog(options = {}) {
            app.dev.log('[fileDialog] called, mode=' + (options.mode || 'open'), 'Explorer');
            return new Promise(resolve => {
                app.explorer._pendingDialog = { mode: options.mode || 'open', options, resolve };
                app.program.open('explorer').catch(e => {
                    app.dev.error('[fileDialog] open() failed: ' + e, 'Explorer');
                    app.explorer._pendingDialog = null;
                    resolve(null);
                });
            });
        },
        select: {
            file(options = {}) {
                return app.explorer.windows.fileDialog({ ...options, mode: 'open' });
            },
            folder(options = {}) {
                return app.explorer.windows.fileDialog({ ...options, mode: 'folder' });
            }
        },
        save: {
            file(options = {}) {
                return app.explorer.windows.fileDialog({ ...options, mode: 'save' });
            }
        },
        dialog: {
            openWith({ ext, path, entry, handlers }) {
                const dlgId  = 'openwith-' + Date.now();
                let _chosen  = null;
                let _always  = false;

                os.ui.windowStart('explorer', {
                    id:        dlgId,
                    title:     _('Open With'),
                    width:     '340px',
                    height:    '310px',
                    resizable: false,
                    single:    false,
                    body() {
                        const ei = app.program?.extInfo?.[ext];
                        const extIconHtml = ei?.icon
                            ? (ei.icontype === 'svg' || ei.icon.startsWith('#')
                                ? `<svg width="32" height="32" style="flex-shrink:0;"><use href="${ei.icon}"></use></svg>`
                                : `<img src="${ei.icon}" width="32" height="32" style="flex-shrink:0;object-fit:contain;">`)
                            : '';
                        const extLabel = ei?.label || ('.' + ext);
                        const extDesc  = ei?.description || '';

                        const rows = handlers.map(h => {
                            const info    = app.program.getInfo(h.id) || {};
                            const iconHml = info.icon
                                ? `<svg width="28" height="28" style="flex-shrink:0"><use href="${info.icon}"></use></svg>`
                                : `<span style="width:28px;height:28px;display:inline-block;flex-shrink:0;"></span>`;
                            return `<div class="opw-row" data-id="${h.id}"
                                style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:default;transition:background .12s;">
                                ${iconHml}
                                <div style="display:flex;flex-direction:column;gap:1px;">
                                    <span style="font-size:12px;color:#fff;font-weight:500;">${info.name || h.id}</span>
                                    <span style="font-size:10px;color:rgba(255,255,255,0.45);">${info.description || ''}</span>
                                </div>
                            </div>`;
                        }).join('');

                        function _doOpen(root) {
                            if (!_chosen) return;
                            if (_always) app.config.set('userexts', ext, _chosen);
                            const h = handlers.find(hh => hh.id === _chosen);
                            os.ui.windows.functions.closeWindow(dlgId);
                            if (h?.fn) h.fn(path, entry);
                        }

                        setTimeout(() => {
                            const root = $('#' + dlgId + '-win')[0];
                            if (!root) return;
                            root.querySelectorAll('.opw-row').forEach(row => {
                                row.addEventListener('click', () => {
                                    root.querySelectorAll('.opw-row').forEach(r => r.style.background = '');
                                    row.style.background = 'var(--theme-backgruondcolorc, rgba(255,255,255,0.12))';
                                    _chosen = row.dataset.id;
                                });
                                row.addEventListener('dblclick', () => { _chosen = row.dataset.id; _doOpen(root); });
                            });
                            root.querySelector('.opw-confirm')?.addEventListener('click', () => _doOpen(root));
                            root.querySelector('.opw-cancel')?.addEventListener('click', () => {
                                os.ui.windows.functions.closeWindow(dlgId);
                            });
                            root.querySelector('.opw-always')?.addEventListener('change', e => { _always = e.target.checked; });
                        }, 0);

                        return `<div style="display:flex;flex-direction:column;height:100%;padding:14px;box-sizing:border-box;color:var(--theme-fontcolor,#fff);gap:10px;">
                            <div style="display:flex;align-items:center;gap:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.1);">
                                ${extIconHtml}
                                <div>
                                    <div style="font-weight:600;">${extLabel}</div>
                                    <div style="opacity:.55;">${extDesc}</div>
                                </div>
                            </div>
                            <div style="opacity:.6;">${_('Choose a program to open')} .${app.util.escapeHtml(ext)} ${_('files with')}:</div>
                            <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">${rows}</div>
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                <input type="checkbox" class="opw-always" style="cursor:pointer;">
                                ${_('Always use this program for')} .${app.util.escapeHtml(ext)}
                            </label>
                            <div style="display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;">
                                <button class="aero-button opw-cancel">${_('Cancel')}</button>
                                <button class="aero-button confirm opw-confirm">${_('Open')}<div class="after pulse"></div></button>
                            </div>
                        </div>`;
                    }
                });
            },

            attributes({ path, entry }) {
                const dlgId    = 'attr-' + Date.now();
                const name     = path.split('/').pop();
                const ext      = (entry?.ext || name.split('.').pop() || '').toLowerCase();
                const ei       = app.program?.extInfo?.[ext] || {};
                const handlers = app.program?.fileHandlers?.[ext] || [];
                const savedId  = app.config?.get?.('userexts', ext) || handlers[0]?.id || null;
                const savedProg = savedId ? (app.program.getInfo(savedId) || {}) : {};
                const isFolder = entry?.type === 'folder';

                app.addCSS('attr-dialog', `
                    .attr-wrap{display:flex;flex-direction:column;height:100%;color:var(--theme-fontcolor,#fff);font-size:var(--theme-font-size,12px);}
                    .attr-tabrow{display:flex;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.15);padding:0 8px;}
                    .attr-nav-item{padding:9px 14px;cursor:default;user-select:none;color:var(--theme-fontcolor,#fff);font-size:var(--theme-font-size,12px);transition:opacity .15s;border-bottom:2px solid transparent;margin-bottom:-1px;}
                    .attr-nav-item:hover{opacity:.85;}
                    .attr-nav-item.active{border-bottom-color:var(--theme-fontcolor,#fff);}
                    .attr-panels{flex:1;min-height:0;overflow-y:auto;padding:14px 16px;box-sizing:border-box;}
                    .attr-panel{display:none;}
                    .attr-panel.active{display:block;}
                    .attr-sep{border:none;border-top:1px solid rgba(255,255,255,0.1);margin:10px 0;}
                    .attr-tbl{width:100%;border-collapse:collapse;}
                    .attr-tbl td{padding:5px 0;vertical-align:middle;line-height:1.4;color:var(--theme-fontcolor,#fff);font-size:var(--theme-font-size,12px);}
                    .attr-tbl td:first-child{width:90px;white-space:nowrap;}
                    .attr-userbox{border:1px solid rgba(255,255,255,0.15);border-radius:4px;margin:4px 0 8px;overflow:hidden;}
                    .attr-userrow{display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:default;user-select:none;color:var(--theme-fontcolor,#fff);font-size:var(--theme-font-size,12px);}
                    .attr-userrow.attr-sel{background:rgba(100,150,255,0.2);}
                    .attr-permbox{border:1px solid rgba(255,255,255,0.15);border-radius:4px;margin:4px 0;overflow:hidden;}
                    .attr-permhdr{display:grid;grid-template-columns:1fr 60px 60px;padding:5px 10px;text-align:center;color:var(--theme-fontcolor,#fff);font-size:var(--theme-font-size,12px);}
                    .attr-permhdr span:first-child{text-align:left;}
                    .attr-permrow{display:grid;grid-template-columns:1fr 60px 60px;align-items:center;padding:6px 10px;border-top:1px solid rgba(255,255,255,0.07);text-align:center;color:var(--theme-fontcolor,#fff);font-size:var(--theme-font-size,12px);}
                    .attr-permrow span:first-child{text-align:left;}
                    .attr-infobox{border:1px solid rgba(255,255,255,0.15);border-radius:4px;overflow:hidden;}
                    .attr-inforow{display:grid;grid-template-columns:140px 1fr;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.07);gap:8px;word-break:break-all;color:var(--theme-fontcolor,#fff);font-size:var(--theme-font-size,12px);}
                    .attr-inforow:last-child{border-bottom:none;}
                `);

                function _iconHtml(sz) {
                    if (isFolder) return `<svg width="${sz}" height="${sz}" style="color:#fbbf24"><use href="#ic-folder"></use></svg>`;
                    if (ei.icon) {
                        const it = ei.icontype || (ei.icon.startsWith('#') ? 'svg' : 'img');
                        if (it === 'svg') return `<svg width="${sz}" height="${sz}"><use href="${ei.icon}"></use></svg>`;
                        return `<img src="${ei.icon}" width="${sz}" height="${sz}" style="object-fit:contain;">`;
                    }
                    return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${sz}px;height:${sz}px;font-size:${Math.round(sz*0.38)}px;font-weight:700;border-radius:${Math.round(sz*0.15)}px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);">${app.util.escapeHtml(ext.toUpperCase().slice(0,4))||'?'}</span>`;
                }

                function _fmtSize(s) {
                    if (typeof s === 'string' && s) return s;
                    const n = Number(s);
                    if (!n) return '—';
                    if (n >= 1099511627776) return (n/1099511627776).toFixed(2) + ' TB';
                    if (n >= 1073741824)    return (n/1073741824).toFixed(2) + ' GB';
                    if (n >= 1048576)       return (n/1048576).toFixed(1) + ' MB';
                    if (n >= 1024)          return Math.round(n/1024) + ' KB';
                    return n + ' B';
                }

                const parentPath = path.split('/').slice(0, -1).join('/') || '/';
                const progIconHml = savedProg.icon
                    ? `<svg width="16" height="16" style="flex-shrink:0;"><use href="${savedProg.icon}"></use></svg>`
                    : '';

                const infoRows = [];
                (app.program?.fileMetaProviders || []).forEach(fn => {
                    try { const r = fn(path, entry, ext); if (Array.isArray(r)) infoRows.push(...r); } catch(e) {}
                });

                const perms = [_('Full control'), _('Modify'), _('Read & execute'), _('Read'), _('Write'), _('Special permissions')];
                const svgUser   = `<svg width="16" height="16" viewBox="0 0 24 24" style="flex-shrink:0;"><path fill="currentColor" d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`;
                const svgShield = `<svg width="16" height="16" viewBox="0 0 24 24" style="flex-shrink:0;"><path fill="currentColor" d="M12 1L3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4z"/></svg>`;

                os.ui.windowStart('explorer', {
                    id:        dlgId,
                    title:     _('Properties') + ' — ' + app.util.escapeHtml(name),
                    width:     '460px',
                    height:    '560px',
                    resizable: false,
                    single:    false,
                    body(windowobj) {
                        const pGeneral  = 'attrp-general-'  + dlgId;
                        const pSecurity = 'attrp-security-' + dlgId;
                        const pInfo     = 'attrp-info-'     + dlgId;

                        const _wid = windowobj?.windowId || dlgId;

                        setTimeout(() => {
                            const win = $('#' + _wid + '-win')[0];
                            if (!win) { app.dev.log(`attr: win #${_wid}-win not found`, 'Explorer'); return; }

                            win.querySelectorAll('.attr-nav-item').forEach(item => {
                                item.addEventListener('click', () => {
                                    win.querySelectorAll('.attr-nav-item').forEach(i => i.classList.remove('active'));
                                    win.querySelectorAll('.attr-panel').forEach(p => p.classList.remove('active'));
                                    item.classList.add('active');
                                    $('#' + item.dataset.panel).addClass('active');
                                });
                            });

                            win.querySelectorAll('.attr-userrow').forEach(row => {
                                row.addEventListener('click', () => {
                                    win.querySelectorAll('.attr-userrow').forEach(r => r.classList.remove('attr-sel'));
                                    row.classList.add('attr-sel');
                                });
                            });

                            win.querySelector('.attr-change-prog')?.addEventListener('click', () => {
                                os.ui.windows.functions.closeWindow(dlgId);
                                app.explorer.windows.dialog.openWith({ ext, path, entry, handlers });
                            });

                            win.querySelector('.attr-cancel')?.addEventListener('click', () => {
                                os.ui.windows.functions.closeWindow(dlgId);
                            });

                            win.querySelector('.attr-advanced')?.addEventListener('click', () => {
                                app.ui.alert({
                                    title: _('Advanced'),
                                    message: _('This feature is not yet configured.'),
                                    confirm: _('OK'),
                                });
                            });

                            win.querySelector('.attr-ok')?.addEventListener('click', () => {
                                const newName    = win.querySelector('.attr-filename')?.value?.trim();
                                const boxes      = win.querySelectorAll('.attr-panel.active input[type="checkbox"]');
                                const isReadonly = boxes[0]?.checked ?? false;
                                const isHidden   = boxes[1]?.checked ?? false;
                                if (newName && newName !== name && entry) {
                                    const pp = path.split('/').slice(0, -1).join('/') || '/';
                                    const pn = app.explorer?._getNode?.(pp);
                                    if (pn?.children?.[name]) {
                                        pn.children[newName] = pn.children[name];
                                        delete pn.children[name];
                                        if (entry) { entry.readonly = isReadonly; entry.hidden = isHidden; }
                                        app.dev.log(`Properties OK: renamed "${name}" → "${newName}"`, 'Explorer');
                                    }
                                } else if (entry) {
                                    entry.readonly = isReadonly;
                                    entry.hidden   = isHidden;
                                }
                                os.ui.windows.functions.closeWindow(dlgId);
                            });
                        }, 0);

                        return `<div class="attr-wrap">
                            <div class="attr-tabrow">
                                <div class="attr-nav-item active" data-panel="${pGeneral}">${_('General')}</div>
                                <div class="attr-nav-item" data-panel="${pSecurity}">${_('Security')}</div>
                                <div class="attr-nav-item" data-panel="${pInfo}">${_('Information')}</div>
                            </div>
                            <div class="attr-panels">

                                    <div class="attr-panel active" id="${pGeneral}">
                                        <div style="display:flex;align-items:center;gap:12px;padding:0 0 10px;">
                                            ${_iconHtml(40)}
                                            <input class="def attr-filename" type="text" value="${app.util.escapeHtml(name)}" style="flex:1;min-width:0;">
                                        </div>
                                        <hr class="attr-sep">
                                        <table class="attr-tbl">
                                            <tr>
                                                <td>${_('File type')}</td>
                                                <td colspan="2">${ei.label || (isFolder ? _('Folder') : app.util.escapeHtml(ext.toUpperCase()))}${ext && !isFolder ? ' (.' + app.util.escapeHtml(ext) + ')' : ''}<br>
                                                    <span style="opacity:.55;">${ei.description || ''}</span></td>
                                            </tr>
                                            <tr>
                                                <td>${_('Opens with')}</td>
                                                <td><div style="display:flex;align-items:center;gap:6px;">${progIconHml}<span>${savedProg.name || (handlers.length ? '—' : _('Unknown'))}</span></div></td>
                                                <td style="text-align:right;">${handlers.length > 0 ? `<button class="aero-button xs attr-change-prog">${_('Change')}</button>` : ''}</td>
                                            </tr>
                                        </table>
                                        <hr class="attr-sep">
                                        <table class="attr-tbl">
                                            <tr><td>${_('Location')}</td><td>${app.util.escapeHtml(parentPath)}</td></tr>
                                            <tr><td>${_('Size')}</td><td>${_fmtSize(entry?.size)}</td></tr>
                                        </table>
                                        <hr class="attr-sep">
                                        <table class="attr-tbl">
                                            <tr><td>${_('Created')}</td><td>${entry?.created || '—'}</td></tr>
                                            <tr><td>${_('Modified')}</td><td>${entry?.modified || '—'}</td></tr>
                                            <tr><td>${_('Accessed')}</td><td>${entry?.accessed || '—'}</td></tr>
                                        </table>
                                        <hr class="attr-sep">
                                        <table class="attr-tbl"><tr>
                                            <td><label style="display:flex;align-items:center;gap:5px;cursor:default;"><input type="checkbox" ${entry?.readonly ? 'checked' : ''}> ${_('Read-only')}</label></td>
                                            <td><label style="display:flex;align-items:center;gap:5px;cursor:default;"><input type="checkbox" ${entry?.hidden ? 'checked' : ''}> ${_('Hidden')}</label></td>
                                            <td style="text-align:right;"><button class="aero-button xs attr-advanced">${_('Advanced')}</button></td>
                                        </tr></table>
                                    </div>

                                    <div class="attr-panel" id="${pSecurity}">
                                        <div style="margin-bottom:10px;word-break:break-all;">
                                            <span style="opacity:.55;">${_('Object name')}:</span> ${app.util.escapeHtml(path)}
                                        </div>
                                        <div style="margin-bottom:4px;opacity:.65;">${_('Group or user names')}:</div>
                                        <div class="attr-userbox">
                                            <div class="attr-userrow attr-sel">${svgUser}<span>${_('User')}</span></div>
                                            <div class="attr-userrow">${svgShield}<span>${_('System')}</span></div>
                                        </div>
                                        <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
                                            <button class="aero-button xs">${_('Edit')}</button>
                                        </div>
                                        <div style="margin-bottom:4px;opacity:.65;">${_('Permissions for')} ${_('System')}:</div>
                                        <div class="attr-permbox">
                                            <div class="attr-permhdr"><span>${_('Permission')}</span><span>${_('Allow')}</span><span>${_('Deny')}</span></div>
                                            ${perms.map(p => `<div class="attr-permrow"><span>${p}</span><span><input type="checkbox" checked></span><span><input type="checkbox"></span></div>`).join('')}
                                        </div>
                                    </div>

                                    <div class="attr-panel" id="${pInfo}">
                                        <div class="attr-infobox">
                                            ${infoRows.length > 0
                                                ? infoRows.map(r => `<div class="attr-inforow"><span>${app.util.escapeHtml(r.key)}</span><span>${app.util.escapeHtml(r.value)}</span></div>`).join('')
                                                : `<div style="padding:12px 10px;opacity:.45;">${_('No information available')}</div>`}
                                        </div>
                                    </div>

                                </div>
                            <div style="display:flex;justify-content:flex-end;gap:8px;padding:10px 16px;flex-shrink:0;border-top:1px solid rgba(255,255,255,0.1);">
                                <button class="aero-button attr-cancel">${_('Cancel')}</button>
                                <button class="aero-button attr-ok">${_('OK')}<div class="after pulse"></div></button>
                            </div>
                        </div>`;
                    }
                });
            }
        }
    };
}
