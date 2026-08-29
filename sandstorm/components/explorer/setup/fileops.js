/**
 * @file explorer/setup/fileops.js
 * @description Boot-safe file operations usable without an Explorer window
 * open: `newFolder`, `remove` (+ its recursive-delete progress window),
 * `newFile`, `rename`, `openFile`, and `pasteItems`. Also registers the
 * desktop background's "New > Folder / Shortcut" submenu entries.
 *
 * Exported `registerFileOps(os)`, called once from explorer/setup/index.js
 * — must run after explorer/setup/core.js (`registerCore`), since every
 * function here reads `app.explorer._getNode`/`_refreshAll`.
 * Split out of the original monolithic explorer/setup.js — moved verbatim,
 * no logic changes (`_explorerUpdateAll(path)` calls became the
 * behaviorally-identical `app.explorer._refreshAll(path)` — see core.js,
 * where `_refreshAll` is defined as exactly that private function).
 *
 * @module components/explorer/setup/fileops
 */
import { isRealStoragePath } from '../window/fsutil.js';
import { realWrite, realDelete } from '../window/realfs.js';

/**
 * Registers `app.explorer.newFolder`/`remove`/`newFile`/`rename`/`openFile`/
 * `pasteItems`, and the desktop "New" submenu's Folder/Shortcut entries.
 *
 * @param {Object} os - The OS/program API.
 * @returns {void}
 */
export function registerFileOps(os) {

    // ── Progress window for recursive delete ──────────────────────────────────
    function _openDeleteStatus(items, parentPath, parentNode, rootName) {
        const total = items.length;
        const uid   = 'fdel-' + Date.now();
        let _dRoot  = null;
        let _done   = 0;
        let _iv     = null;

        os.ui.windowStart('explorer', {
            id:        uid,
            title:     _('Deleting') + ' ' + total + ' ' + (total === 1 ? _('item') : _('items')),
            width:     '420px',
            height:    Math.min(520, Math.max(280, 200 + total * 28)) + 'px',
            resizable: false,
            body(windowobj) {
                const wid = windowobj?.windowId || (uid + '-0');
                setTimeout(() => {
                    _dRoot = document.querySelector(`#${wid}-win .fdel-root`);
                    if (!_dRoot) return;
                    _dRoot.querySelector('.fdel-cancel-btn')?.addEventListener('click', _abort);
                    app.api.post('/api/fs/remove', { paths: items.map(i => i.path), recursive: true })
                        .success(() => _runSim())
                        .fail(() => _runSim());
                }, 0);

                function _abort() {
                    clearInterval(_iv); _iv = null;
                    _dRoot?.querySelectorAll('.fdel-item').forEach((row, i) => {
                        if (i >= _done) {
                            row.querySelector('.fdel-item-status').className = 'fdel-item-status fop-item-error';
                            row.querySelector('.fdel-item-state').textContent = _('Cancelled');
                        }
                    });
                    _showClose('cancel', _('Operation cancelled'));
                }

                function _pct() { return Math.round((_done / total) * 100); }

                function _updatePct() {
                    const fill = _dRoot?.querySelector('.fdel-progress-fill');
                    const txt  = _dRoot?.querySelector('.fdel-progress-txt');
                    if (fill) fill.style.width = _pct() + '%';
                    if (txt)  txt.textContent  = _pct() + '%';
                }

                function _runSim() {
                    if (_done >= total) { _finish(); return; }
                    _iv = setInterval(() => {
                        if (!_dRoot || !document.contains(_dRoot)) { clearInterval(_iv); return; }
                        const rows = _dRoot.querySelectorAll('.fdel-item');
                        if (rows[_done]) {
                            rows[_done].querySelector('.fdel-item-status').className = 'fdel-item-status fop-item-active';
                            rows[_done].querySelector('.fdel-item-state').textContent = _('Deleting…');
                        }
                        setTimeout(() => {
                            if (!_dRoot) return;
                            if (rows[_done]) {
                                rows[_done].querySelector('.fdel-item-status').className = 'fdel-item-status fop-item-done';
                                rows[_done].querySelector('.fdel-item-state').textContent = _('Done');
                            }
                            _done++;
                            _updatePct();
                            if (_done >= total) { clearInterval(_iv); _iv = null; _finish(); }
                        }, 280);
                    }, 500);
                }

                function _finish() {
                    _updatePct();
                    delete parentNode.children[rootName];
                    app.dev.log(`remove (sub): deleted ${total} item(s) under "${rootName}"`, 'Explorer');
                    app.explorer._refreshAll(parentPath);
                    _showClose('success', _('Deleted') + ' ' + total + ' ' + (total === 1 ? _('item') : _('items')));
                }

                function _showClose(state, msg) {
                    const footer = _dRoot?.querySelector('.fdel-footer');
                    if (!footer) return;
                    const cls = state === 'success' ? 'fop-done-msg' : 'fop-warn-msg';
                    footer.innerHTML = `<span class="${cls}">${msg}</span>
                        <button class="fdel-close-btn">${_('Close')}</button>`;
                    footer.querySelector('.fdel-close-btn')?.addEventListener('click', () => {
                        document.querySelector(`#${wid}-win .window-close`)?.click();
                    });
                }

                return `<div class="fdel-root fop-root">
                    <div class="fop-header">
                        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        <span>${_('Deleting')} ${total} ${total === 1 ? _('item') : _('items')}</span>
                    </div>
                    <div class="fop-progress-wrap">
                        <div class="fop-progress-bar"><div class="fdel-progress-fill fop-progress-fill" style="width:0%"></div></div>
                        <span class="fdel-progress-txt fop-progress-txt">0%</span>
                    </div>
                    <div class="fop-items">
                        ${items.map(item => `
                            <div class="fdel-item fop-item">
                                <span class="fdel-item-status fop-item-status fop-item-pending">●</span>
                                <span class="fop-item-name">${item.name}</span>
                                <span class="fdel-item-state fop-item-state">${_('Pending')}</span>
                            </div>`).join('')}
                    </div>
                    <div class="fdel-footer fop-footer">
                        <button class="fdel-cancel-btn">${_('Cancel')}</button>
                    </div>
                </div>`;
            }
        });
    }

    // ── app.explorer.newFolder(path, where) ───────────────────────────────────
    app.explorer.newFolder = function(path, where = 'view') {
        if (typeof path !== 'string') {
            app.ui.alert({ title: _('Error'), message: _('Path must be a string'), confirm: _('OK') });
            return;
        }
        const cleanPath  = path.replace(/\/+$/, '');
        const lastSlash  = cleanPath.lastIndexOf('/');
        const parentPath = lastSlash <= 0 ? '/' : cleanPath.slice(0, lastSlash);
        const folderName = cleanPath.slice(lastSlash + 1) || _('New Folder');

        if (isRealStoragePath(cleanPath)) {
            app.ui.alert({ title: _('Not supported'), message: _('Creating folders in RealStorage is not supported yet.'), confirm: _('OK') });
            return;
        }

        const parentNode = app.explorer._getNode(parentPath);
        if (!parentNode || parentNode.type !== 'folder') {
            app.ui.alert({ title: _('Error'), message: _('Parent folder not found') + ': ' + parentPath, confirm: _('OK') });
            return;
        }
        if (parentNode.children[folderName]) {
            app.ui.alert({ title: _('Error'), message: _('A folder with that name already exists'), confirm: _('OK') });
            return;
        }

        app.api.post('/api/fs/mkdir', { path: cleanPath })
            .success(() => _commit())
            .fail(()    => _commit());

        function _commit() {
            parentNode.children[folderName] = { type: 'folder', children: {} };
            app.dev.log(`newFolder: "${cleanPath}"`, 'Explorer');
            app.explorer._refreshAll(where === 'desktop' ? '/Desktop' : parentPath);
        }
    };

    // ── "New Folder" in desktop background submenu.new ───────────────────────
    if (app.desktop?.contextMenu?.submenu?.new) {
        app.desktop.contextMenu.submenu.new.add({
            icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z"/></svg>',
            text: () => _('Folder'),
            alt:  '',
            fn() { app.desktop?.icon?.startInlineNew?.('folder'); }
        });
        app.desktop.contextMenu.submenu.new.add({
            icon: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zM5 5v14h14v-7h-2v5H7V7h5V5H5z"/></svg>',
            text: () => _('Shortcut'),
            alt:  '',
            fn() { app.explorer.shortcutEditor.open({ mode: 'create' }); }
        });
    }

    // ── app.explorer.remove(path, sub) ────────────────────────────────────────
    app.explorer.remove = function(path, sub = 'one') {
        if (typeof path !== 'string') {
            app.ui.alert({ title: _('Error'), message: _('Path must be a string'), confirm: _('OK') });
            return;
        }
        const parts      = path.split('/').filter(Boolean);
        const rootName   = parts.pop() || '';
        const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/');

        const parentNode = app.explorer._getNode(parentPath);
        if (!parentNode?.children?.[rootName]) {
            app.ui.alert({ title: _('Error'), message: _('Item not found') + ': ' + path, confirm: _('OK') });
            return;
        }

        const targetNode  = parentNode.children[rootName];
        const isRecursive = sub === true || sub === 'sub';

        if (isRealStoragePath(path)) {
            if (targetNode.type === 'folder') {
                app.ui.alert({ title: _('Not supported'), message: _('Deleting folders in RealStorage is not supported yet.'), confirm: _('OK') });
                return;
            }
            realDelete(path)
                .then(() => _doDelete())
                .catch(e => app.ui.alert({ title: _('Error'), message: e.message || _('Delete failed'), confirm: _('OK') }));
            return;
        }

        if (isRecursive && targetNode.type === 'folder' && Object.keys(targetNode.children || {}).length > 0) {
            const items = [];
            (function collect(node, prefix) {
                Object.entries(node.children || {}).forEach(([name, child]) => {
                    const p = prefix + '/' + name;
                    items.push({ name, path: p });
                    if (child.type === 'folder') collect(child, p);
                });
            })(targetNode, path);
            items.push({ name: rootName, path });
            _openDeleteStatus(items, parentPath, parentNode, rootName);
        } else {
            app.api.post('/api/fs/remove', { path, recursive: false })
                .success(() => _doDelete())
                .fail(()    => _doDelete());
        }

        function _doDelete() {
            delete parentNode.children[rootName];
            app.dev.log(`remove: "${path}"`, 'Explorer');
            app.explorer._refreshAll(parentPath);
        }
    };

    // ── app.explorer.newFile(path, content) ───────────────────────────────────
    app.explorer.newFile = function(path, content = '') {
        if (typeof path !== 'string') {
            app.ui.alert({ title: _('Error'), message: _('Path must be a string'), confirm: _('OK') });
            return;
        }
        const cleanPath  = path.replace(/\/+$/, '');
        const lastSlash  = cleanPath.lastIndexOf('/');
        const parentPath = lastSlash <= 0 ? '/' : cleanPath.slice(0, lastSlash);
        const fileName   = cleanPath.slice(lastSlash + 1);
        const ext        = fileName.includes('.') ? fileName.split('.').pop() : '';

        const parentNode = app.explorer._getNode(parentPath);
        if (!parentNode || parentNode.type !== 'folder') {
            app.ui.alert({ title: _('Error'), message: _('Parent folder not found') + ': ' + parentPath, confirm: _('OK') });
            return;
        }
        if (parentNode.children[fileName]) {
            app.ui.alert({ title: _('Error'), message: _('A file with that name already exists'), confirm: _('OK') });
            return;
        }

        if (isRealStoragePath(cleanPath)) {
            realWrite(cleanPath, content || '')
                .then(result => {
                    parentNode.children[fileName] = {
                        type: 'file',
                        size: result.size,
                        modified: new Date().toISOString().slice(0, 10),
                        ext
                    };
                    app.dev.log(`newFile (real): "${cleanPath}"`, 'Explorer');
                    app.explorer._refreshAll(parentPath);
                })
                .catch(e => app.ui.alert({ title: _('Error'), message: e.message || _('Write failed'), confirm: _('OK') }));
            return;
        }

        app.api.post('/api/fs/touch', { path: cleanPath })
            .success(() => _commit())
            .fail(()    => _commit());

        function _commit() {
            parentNode.children[fileName] = {
                type: 'file',
                size: content ? content.length + ' B' : '0 B',
                modified: new Date().toISOString().slice(0, 10),
                ext,
                content: content || ''
            };
            app.dev.log(`newFile: "${cleanPath}"`, 'Explorer');
            app.explorer._refreshAll(parentPath);
        }
    };

    // Public pointer for inline file creation (set by each start instance)
    app.explorer._activeStartInlineNewFile = null;

    // ── app.explorer.rename(path, newName) ─────────────────────────────────────
    // Boot-safe rename, usable without an Explorer window (e.g. desktop icons).
    app.explorer.rename = function(path, newName) {
        if (isRealStoragePath(path)) {
            app.ui.alert({ title: _('Not supported'), message: _('Renaming items in RealStorage is not supported yet.'), confirm: _('OK') });
            return;
        }

        const parts    = path.split('/').filter(Boolean);
        const oldName  = parts.pop();
        const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/');
        const parentNode = app.explorer._getNode(parentPath);
        if (!parentNode?.children?.[oldName]) return;

        newName = (newName || '').trim();
        if (!newName || newName === oldName) return;
        if (parentNode.children[newName]) {
            app.ui.alert({ title: _('Error'), message: _('A file or folder with that name already exists'), confirm: _('OK') });
            return;
        }

        parentNode.children[newName] = parentNode.children[oldName];
        delete parentNode.children[oldName];
        app.dev.log(`rename: "${path}" → "${newName}"`, 'Explorer');
        app.api.post('/api/fs/rename', { path, oldName, newName })?.success?.(() => {})?.fail?.(() => {});
        app.explorer._refreshAll(parentPath);
    };

    // ── app.explorer.openFile(path, entry) ──────────────────────────────────────
    // Boot-safe "open with default/registered handler" — usable without an
    // Explorer window (e.g. double-clicking a file icon on the desktop).
    app.explorer.openFile = function(path, entry) {
        const e        = entry || app.explorer._getNode(path);
        const ext      = (e?.ext || path.split('.').pop() || '').toLowerCase();
        const handlers = app.program?.fileHandlers?.[ext];

        if (!handlers || handlers.length === 0) {
            app.ui.alert({
                title:   _('Cannot Open'),
                body:    () => `<p style="margin:0;line-height:1.5;">${_('No program is registered to open')} <b>.${app.util.escapeHtml(ext)}</b> ${_('files.')}</p>`,
                confirm: _('OK')
            });
            return;
        }

        if (handlers.length === 1) { handlers[0].fn(path, e); return; }

        const savedId = app.config?.get?.('userexts', ext);
        if (savedId) {
            const saved = handlers.find(h => h.id === savedId);
            if (saved) { saved.fn(path, e); return; }
        }

        app.explorer.windows.dialog.openWith({ ext, path, entry: e, handlers });
    };

    // ── app.explorer.pasteItems(items, mode, destPath) ──────────────────────────
    // Boot-safe immediate copy/move (no progress-window UI — that's an
    // Explorer-window-only polish layer built on top of this in explorer.js).
    // Used by the desktop's own Paste action.
    app.explorer.pasteItems = function(items, mode, destPath) {
        const itemList = [].concat(items);
        if (isRealStoragePath(destPath) || itemList.some(isRealStoragePath)) {
            app.ui.alert({ title: _('Not supported'), message: _('Moving or copying items into or out of RealStorage is not supported yet.'), confirm: _('OK') });
            return;
        }

        const destNode = app.explorer._getNode(destPath);
        if (!destNode || destNode.type !== 'folder') return;

        [].concat(items).forEach(srcPath => {
            const parts   = srcPath.split('/').filter(Boolean);
            const name    = parts.pop();
            const srcParentPath = parts.length === 0 ? '/' : '/' + parts.join('/');
            const srcParent = app.explorer._getNode(srcParentPath);
            if (!srcParent?.children?.[name]) return;
            if (srcParentPath === destPath) return;

            let destName = name, i = 1;
            while (destNode.children[destName]) destName = name + ' (' + (i++) + ')';
            destNode.children[destName] = JSON.parse(JSON.stringify(srcParent.children[name]));
            if (mode === 'cut') delete srcParent.children[name];
        });

        app.dev.log(`pasteItems (${mode}) ${[].concat(items).length} item(s) → ${destPath}`, 'Explorer');
        app.api.post('/api/fs/paste', { items, mode, destPath })?.success?.(() => {})?.fail?.(() => {});
        app.explorer._refreshAll(destPath);
    };
}
