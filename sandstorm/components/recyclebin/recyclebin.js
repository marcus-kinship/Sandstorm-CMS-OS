/**
 * @file recyclebin/recyclebin.js
 * @description Recycle Bin program window for Sandstorm OS.
 *
 * Lazy-loaded by `app.program.open()` the first time the user opens the
 * program — registration (icons + metadata) and the `app.recyclebin` API
 * live in `setup.js` (boot-critical, used by Explorer regardless of
 * whether this window is ever opened).
 *
 * @module components/recyclebin/recyclebin
 */
export function start(os) {
    _openWindow(os);
}


function _openWindow(os) {
    const uid = 'rb-' + Date.now();
    let _root = null;
    let _sel  = new Set();

    app.addCSS('recyclebin-ui', `
        .exp-list-body .exp-row.rb-sel td { background: rgba(80,120,255,.18); }
        .exp-list-body .exp-row.rb-sel:hover td { background: rgba(80,120,255,.28); }
        .exp-meta-rows button.aero-button { width: 100%; box-sizing: border-box; }
        .rb-danger { background: rgba(200,40,40,.18); border-color: rgba(200,40,40,.35); color: #ff9a9a; }
        .rb-danger:hover { background: rgba(200,40,40,.32); }
    `, true);

    os.ui.windowStart('recyclebin', {
        id:        uid,
        title:     _('Recycle Bin'),
        windowIcon: true,
        width:        "1000px",
        height:       "700px",
        resizable: true,
        body(windowobj) {
            setTimeout(() => {
                const wid = windowobj?.windowId || uid;
                _root = document.getElementById(wid + '-win');
                if (_root) _render();
            }, 0);

            return app.explorer.windows.buildShell();
        }
    });

    // ── Render helpers ────────────────────────────────────────────────────────

    function _render() {
        _renderList();
        _renderMeta();
    }

    function _renderList() {
        if (!_root) return;
        const list  = _root.querySelector('.exp-list-body');
        const items = app.recyclebin._items;
        if (!list) return;

        if (!items.length) {
            list.innerHTML = `<div class="exp-empty"><span>${_('Recycle Bin is empty')}</span></div>`;
            const ft = _root.querySelector('.exp-footer-text');
            if (ft) ft.textContent = '';
            return;
        }

        list.innerHTML = `<table class="exp-table">
            <thead><tr>
                <th>${_('Name')}</th>
                <th>${_('Original location')}</th>
                <th>${_('Type')}</th>
                <th>${_('Deleted')}</th>
                <th>${_('Size')}</th>
            </tr></thead>
            <tbody>${items.map((item, i) => {
                const isFolder = item.entry?.type === 'folder';
                const ext      = item.entry?.ext || '';
                const typeStr  = isFolder ? _('Folder') : (app.util.escapeHtml(ext.toUpperCase()) || '—');
                const icon     = _itemIcon(item);
                return `<tr class="exp-row${_sel.has(item.id) ? ' rb-sel' : ''}" data-id="${item.id}" style="--exp-delay:${i * 0.025}s;">
                    <td><div style="display:flex;align-items:center;gap:8px;">${icon}<span>${app.util.escapeHtml(item.name)}</span></div></td>
                    <td style="opacity:.55;font-size:11px;">${app.util.escapeHtml(item.parentPath)}</td>
                    <td style="opacity:.7;">${typeStr}</td>
                    <td style="opacity:.7;">${item.deletedAt}</td>
                    <td style="opacity:.7;">${item.entry?.size || '—'}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;

        void list.offsetHeight;
        list.querySelectorAll('.exp-row').forEach(row => {
            row.classList.add('exp-visible');
            row.addEventListener('click', e => {
                const id = row.dataset.id;
                if (e.ctrlKey || e.metaKey) {
                    _sel.has(id) ? _sel.delete(id) : _sel.add(id);
                } else {
                    _sel.clear(); _sel.add(id);
                }
                list.querySelectorAll('.exp-row').forEach(r =>
                    r.classList.toggle('rb-sel', _sel.has(r.dataset.id)));
                _renderMeta();
            });
        });

        const footerText = _root.querySelector('.exp-footer-text');
        if (footerText) footerText.textContent = items.length + ' ' + (items.length === 1 ? _('item') : _('items'));
    }

    function _renderMeta() {
        if (!_root) return;
        const total  = app.recyclebin._items.length;
        const selIds = [..._sel];

        const nameEl = _root.querySelector('.exp-meta-name');
        if (nameEl) nameEl.textContent = total + ' ' + (total === 1 ? _('item') : _('items'));

        // Sync icon to empty/full state (init icon on first render too)
        let iconEl = _root.querySelector('.exp-meta-icon svg');
        if (!iconEl) {
            iconEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            iconEl.setAttribute('width', '42'); iconEl.setAttribute('height', '42');
            iconEl.setAttribute('viewBox', '0 0 24 24');
            iconEl.style.opacity = '.7';
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            iconEl.appendChild(use);
            _root.querySelector('.exp-meta-icon').appendChild(iconEl);
        }
        const useEl = iconEl.querySelector('use');
        const href  = total > 0 ? '#ic-recyclebin-full' : '#ic-recyclebin';
        useEl.setAttribute('href', href);
        useEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);

        const actions = _root.querySelector('.exp-meta-rows');
        if (!actions) return;
        actions.innerHTML = '';

        if (selIds.length) {
            const selRow = document.createElement('div');
            selRow.className = 'exp-meta-row';
            selRow.innerHTML = `<span class="exp-meta-label">${selIds.length} ${_('selected')}</span>`;
            actions.appendChild(selRow);

            const btnRestore = document.createElement('button');
            btnRestore.className = 'aero-button';
            btnRestore.textContent = _('Restore selected');
            btnRestore.addEventListener('click', () => {
                app.recyclebin.restore(selIds);
                _sel.clear(); _render();
            });
            actions.appendChild(btnRestore);

            const btnDel = document.createElement('button');
            btnDel.className = 'aero-button rb-danger';
            btnDel.textContent = _('Delete permanently');
            btnDel.addEventListener('click', () => {
                app.ui.confirm({
                    title:     _('Delete permanently'),
                    message:   _('This cannot be undone.') + '\n' + _('Delete') + ' ' + selIds.length + ' ' + (selIds.length === 1 ? _('item') : _('items')) + '?',
                    confirm:   _('Delete'),
                    cancel:    _('Cancel'),
                    onConfirm: () => {
                        app.recyclebin.deletePermanently(selIds);
                        _sel.clear(); _render();
                    }
                });
            });
            actions.appendChild(btnDel);

            const sep = document.createElement('hr');
            sep.style.cssText = 'border:none;border-top:1px solid rgba(255,255,255,.08);margin:4px 0;';
            actions.appendChild(sep);
        }

        const btnEmpty = document.createElement('button');
        btnEmpty.className = 'aero-button rb-danger';
        btnEmpty.textContent = _('Empty Recycle Bin');
        btnEmpty.disabled = !total;
        btnEmpty.addEventListener('click', () => {
            app.recyclebin.empty();
            setTimeout(() => { _sel.clear(); _render(); }, 50);
        });
        actions.appendChild(btnEmpty);
    }

    function _itemIcon(item) {
        if (item.entry?.type === 'folder') {
            return `<svg width="15" height="15" style="color:#fbbf24"><use href="#ic-folder"></use></svg>`;
        }
        const ext = item.entry?.ext || '';
        const clr = { pdf:'#f87171',txt:'#94a3b8',xlsx:'#4ade80',docx:'#60a5fa',
                      jpg:'#facc15',png:'#facc15',gif:'#facc15',mp3:'#c084fc',mp4:'#c084fc',
                      exe:'#fb923c',zip:'#a78bfa',html:'#f97316',js:'#fbbf24',css:'#60a5fa' }[ext]
                   || 'rgba(255,255,255,0.4)';
        return `<span style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;font-size:7px;font-weight:700;border-radius:3px;background:${clr}22;color:${clr};">${(ext||'?').toUpperCase().slice(0,4)}</span>`;
    }
}
