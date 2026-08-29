/**
 * @file explorer/window/dragdrop.js
 * @description Drag-and-drop: list/grid rows onto folder targets (tree rows,
 * grid folders, or table folder rows, in ANY open Explorer window, or the
 * desktop), tree-row reordering as a move operation, the move/copy progress
 * window, and side-panel row click/expand/collapse/context-menu delegation.
 *
 * Split out of the original monolithic explorer.js, each function taking
 * `state` as its first parameter instead of closing over free variables.
 * `openMoveStatus` reads `state.os` (set once by window/index.js when it
 * creates `state`) instead of an `os` closure variable, so its signature
 * doesn't need a separate `os` parameter threaded through every caller
 * (menus.js's Paste callbacks, in particular).
 *
 * Two bugs fixed here (both pre-existing in the original monolith, not
 * introduced by the split):
 * 1. The drop-target selector was scoped to the source window's own
 *    `#${wid}-win`, so `elementFromPoint().closest(dropSelector)` (see
 *    `app.ui.dragDrop` in ui.js) could never match a row in a DIFFERENT
 *    Explorer window — cross-window drag-drop was structurally impossible.
 *    Now unscoped (`DROP_TARGET_SELECTOR`) and extended to desktop folder
 *    icons / empty desktop space.
 * 2. `openMoveStatus`'s progress window was purely cosmetic — its `_finish()`
 *    never actually mutated `app.explorer._fs`, so a "completed" move/copy
 *    silently did nothing to the data (the same gap existed in the
 *    clipboard-paste-via-context-menu path, which also routes through this
 *    function — see menus.js). `_finish()` now commits via the existing
 *    `app.explorer.pasteItems()`, which already has the correct move/copy +
 *    name-collision logic and refreshes every affected window/the desktop.
 *
 * @module components/explorer/window/dragdrop
 */
import { clearSearch } from './search.js';
import { updateMain } from './core.js';
import { treeExpand, treeCollapse } from './tree.js';
import { treeRowMenu } from './menus.js';
import { navigate } from './core.js';
import { isRealStoragePath } from './fsutil.js';
import { ensureRealFolderLoaded } from './realfs.js';

const DROP_TARGET_SELECTOR = [
    '.exp-tree-row[data-folder="true"]',
    '.exp-grid-item[data-folder="true"]',
    '.exp-row[data-folder="true"]',
    '.desktop-icon[data-kind="fs"]', // filtered to folders only in _resolveDropTargetPath
    '.desktop-icons',                // empty desktop space → /Desktop
    '.exp-list-body',                // empty space within a window's own list/grid → that window's current folder
].join(', ');

/**
 * Resolves a drag-drop target element (an Explorer row/tree-item in any
 * window, a desktop folder icon, the desktop's own empty-space container,
 * or the empty area of an Explorer window's own list/grid) to the
 * destination fs path, or `null` if it isn't a valid folder to drop into
 * (e.g. a desktop icon backed by a file, not a folder).
 *
 * @param {HTMLElement|null} tgt
 * @returns {string|null}
 */
function _resolveDropTargetPath(tgt) {
    if (!tgt) return null;
    if (tgt.classList.contains('desktop-icons')) return '/Desktop';
    if (tgt.dataset.fspath) {
        const node = app.explorer._getNode(tgt.dataset.fspath);
        return node?.type === 'folder' ? tgt.dataset.fspath : null;
    }
    if (tgt.dataset.path) return tgt.dataset.path;
    if (tgt.classList.contains('exp-list-body')) {
        const winEl = tgt.closest('.window');
        const inst = winEl && app.explorer._instances.find(i => i.root && winEl.contains(i.root));
        return inst ? inst.currentPath() : null;
    }
    return null;
}

/**
 * Wires drag-and-drop from list/grid rows onto folder drop targets — any
 * open Explorer window, or the desktop (a folder icon, or empty space for
 * `/Desktop` itself).
 *
 * @param {Object} state
 * @param {string} wid
 * @param {HTMLElement} listBody
 * @returns {void}
 */
export function bindDragDrop(state, wid, listBody) {
    const _desktopIcons = () => document.querySelector('.desktop-icons');
    app.ui.dragDrop(
        listBody,
        `#${wid}-win .exp-row, #${wid}-win .exp-grid-item`,
        DROP_TARGET_SELECTOR,
        {
            onStart() {
                _desktopIcons()?.classList.add('dd-drop-active');
            },
            onOver(items, tgt) {
                const tp = _resolveDropTargetPath(tgt);
                if (!tp || tp === state.path) return false;
                if (items.some(el => el.dataset.path === tp)) return false;
                return true;
            },
            onDrop(items, tgt, e) {
                _desktopIcons()?.classList.remove('dd-drop-active');
                const toPath = _resolveDropTargetPath(tgt);
                if (!toPath || toPath === state.path) return;
                if (items.some(el => el.dataset.path === toPath)) return;
                const fileItems = items.map(el => ({
                    path: el.dataset.path,
                    name: (el.dataset.path || '').split('/').pop(),
                    isFolder: el.dataset.folder === 'true',
                })).filter(i => i.path);
                if (!fileItems.length) return;
                const mode = e?.ctrlKey ? 'copy' : 'cut';
                app.dev.log(`Drag-drop start: ${mode} ${fileItems.length} item(s) "${state.path}" → "${toPath}"`, 'Explorer');
                openMoveStatus(state, fileItems, state.path, toPath, mode);
            },
            onCancel() {
                _desktopIcons()?.classList.remove('dd-drop-active');
            },
        }
    );
}

/**
 * Catches a desktop-icon drag landing on this Explorer window. Desktop icon
 * dragging (desktop/icons.js) is a separate, pre-existing jQuery-UI/manual
 * system — not `app.ui.dragDrop` — so it can't appear in `DROP_TARGET_SELECTOR`
 * above the way another Explorer window's rows can. Instead this reuses the
 * same convention `program/mediaplayer/mediaplayer_data.js` and
 * `program/fotoviewer/fotoviewer.js` already use to receive a drop FROM
 * Explorer: the drag source stamps a `data-path` marker on the item(s) being
 * dragged, and the receiver catches `mouseup` while that marker is still
 * present. Here it's the same convention in reverse — the desktop is the
 * source, an Explorer window is the receiver. Deliberately `data-path`
 * alone, not Explorer's own `.dd-dragging` class too — that class also
 * carries `opacity:0.3` ghost-drag styling, which would visibly fade the
 * dragged desktop icon(s) for the whole drag (see desktop/icons.js's own
 * comment on this).
 *
 * Only reacts to `.desktop-icon` sources (`.exp-row`/`.exp-grid-item`/
 * `.exp-tree-row` drags already go through `bindDragDrop`'s own `onDrop`
 * above — reacting to those here too would paste the same drop twice).
 *
 * Bound on the window element itself, NOT `document` — jQuery UI's own
 * mouseup handling (desktop/icons.js's single-icon `.draggable()`) is bound
 * to `document` and strips the marker there as soon as the drag ends. Since
 * `mouseup` bubbles from the actual target up through this window's own DOM
 * before ever reaching `document`, a listener here always sees the marker
 * first — the same ordering trick
 * `program/mediaplayer/mediaplayer_data.js`'s own `winContainer.addEventListener('mouseup', …)`
 * already relies on for the same reason.
 *
 * @param {Object} state
 * @param {string} wid
 * @returns {function} cleanup
 */
export function bindExternalDrop(state, wid) {
    function onMouseUp(e) {
        const dragged = [...document.querySelectorAll('.desktop-icon[data-path]')];
        if (!dragged.length) return;
        if (!document.contains(state.winRoot)) return; // window closed but listener not yet cleaned up

        const under = document.elementFromPoint(e.clientX, e.clientY);
        const tgt = under?.closest('.exp-tree-row[data-folder="true"], .exp-grid-item[data-folder="true"], .exp-row[data-folder="true"]');
        // No specific folder row under the cursor → drop into whatever folder this window is currently showing.
        const toPath = tgt ? tgt.dataset.path : state.path;
        if (!toPath) return;

        const items = dragged.map(el => ({
            path: el.dataset.path,
            name: (el.dataset.path || '').split('/').pop(),
            isFolder: el.dataset.folder === 'true',
        })).filter(i => i.path && i.path !== toPath);
        if (!items.length) return;

        const acceptedPaths = new Set(items.map(i => i.path));
        dragged.forEach(el => { if (acceptedPaths.has(el.dataset.path)) el.dataset.dropAccepted = '1'; });

        const mode = e.ctrlKey ? 'copy' : 'cut';
        app.dev.log(`Drag-drop start: ${mode} ${items.length} item(s) "Desktop" → "${toPath}"`, 'Explorer');
        openMoveStatus(state, items, _('Desktop'), toPath, mode);
    }

    const winEl = document.getElementById(`${wid}-win`);
    if (!winEl) return () => {};
    winEl.addEventListener('mouseup', onMouseUp);
    return () => winEl.removeEventListener('mouseup', onMouseUp);
}

/**
 * Wires tree-row drag reordering as a move-into-folder operation.
 *
 * @param {Object} state
 * @param {string} wid
 * @param {HTMLElement} sideBody
 * @returns {void}
 */
export function bindSideDragDrop(state, wid, sideBody) {
    const $sb = $(sideBody);
    if ($sb.hasClass('ui-sortable')) $sb.sortable('destroy');

    let _draggedPath = null;
    let _wasMoved    = false;

    $sb.sortable({
        items:              '.exp-tree-row',
        placeholder:        'exp-side-placeholder',
        forcePlaceholderSize: true,
        tolerance:          'pointer',
        distance:           6,
        helper(event, el) {
            _draggedPath = el[0].dataset.path;
            const name = el.find('.exp-tree-name').text() || _draggedPath.split('/').pop();
            return $('<div class="exp-side-helper"></div>').text(name);
        },
        start(event, ui) {
            _wasMoved = false;
            ui.placeholder.css({ height: ui.item.outerHeight() });
        },
        sort() { _wasMoved = true; },
        stop(event, ui) {
            if (!_wasMoved || !_draggedPath) { $sb.sortable('cancel'); return; }

            const $prev = ui.item.prev('.exp-tree-row');
            const $next = ui.item.next('.exp-tree-row');
            const refPath = $prev.length
                ? $prev[0].dataset.path
                : ($next.length ? $next[0].dataset.path : null);
            const destPath = refPath
                ? (refPath.includes('/') ? refPath.split('/').slice(0, -1).join('/') || '/' : '/')
                : '/';

            $sb.sortable('cancel');

            const srcParent = _draggedPath.includes('/')
                ? _draggedPath.split('/').slice(0, -1).join('/') || '/'
                : '/';
            if (destPath === srcParent) return;
            if (_draggedPath === destPath || destPath.startsWith(_draggedPath + '/')) return;

            openMoveStatus(
                state,
                [{ path: _draggedPath, name: _draggedPath.split('/').pop(), isFolder: true }],
                srcParent,
                destPath
            );
        },
    });
}

/**
 * Opens the move/copy progress window for a drag-drop or clipboard-paste
 * operation, then — once the (simulated, per-item) progress animation
 * completes — actually performs the filesystem change via
 * `app.explorer.pasteItems`, which handles the move/copy + name-collision
 * logic and refreshes every open Explorer window plus the desktop icons in
 * one call (`app.explorer._refreshAll`, invoked internally by `pasteItems`).
 *
 * @param {Object} state
 * @param {{path: string, name: string, isFolder: boolean}[]} items
 * @param {string} fromPath - Display-only label for the "From" row (e.g. a
 *   real fs path for drag-drop, or "Clipboard" for a paste — see menus.js's
 *   Paste callbacks. Never used for the actual data operation.)
 * @param {string} toPath
 * @param {"cut"|"copy"} [mode="cut"] - "cut" moves (the pre-existing
 *   default), "copy" duplicates — same vocabulary as
 *   `app.explorer.clipboard.mode`.
 * @returns {void}
 */
export function openMoveStatus(state, items, fromPath, toPath, mode = 'cut') {
    const os = state.os;
    const total   = items.length;
    const winH    = Math.min(530, Math.max(300, 220 + total * 30)) + 'px';
    const uid     = 'fop-' + Date.now();
    const verbing = mode === 'copy' ? _('Copying') : _('Moving');
    const verbed  = mode === 'copy' ? _('Copied')  : _('Moved');
    let _sRoot    = null;
    let _iv       = null;
    let _paused   = false;
    let _done     = 0;

    os.ui.windowStart('explorer', {
        id:        uid,
        title:     verbing + ' ' + total + ' ' + (total === 1 ? _('item') : _('items')),
        width:     '460px',
        height:    winH,
        resizable: false,
        body(windowobj) {
            const wid = windowobj?.windowId || (uid + '-0');

            setTimeout(() => {
                _sRoot = document.querySelector(`#${wid}-win .fop-root`);
                if (!_sRoot) return;
                _sRoot.querySelector('.fop-cancel-btn')?.addEventListener('click', () => _abort());

                app.api.post('/api/fs/move', {
                    items: items.map(i => i.path),
                    from:  fromPath,
                    to:    toPath,
                }).success(() => _runSim()).fail(() => _runSim());
            }, 0);

            function _abort() {
                clearInterval(_iv); _iv = null;
                _sRoot?.querySelectorAll('.fop-item').forEach((row, i) => {
                    if (i >= _done) {
                        row.querySelector('.fop-item-status').className = 'fop-item-status fop-item-error';
                        row.querySelector('.fop-item-state').textContent = _('Cancelled');
                    }
                });
                _showClose('cancel', _('Operation cancelled'));
            }

            function _setPb(state) {
                const f = _sRoot?.querySelector('.fop-progress-fill');
                if (f) f.className = 'fop-progress-fill' +
                    (state === 'fail' ? ' fop-pb-fail' : state === 'warn' ? ' fop-pb-warn' : '');
            }

            function _updatePct() {
                const pct  = Math.round((_done / total) * 100);
                const fill = _sRoot?.querySelector('.fop-progress-fill');
                const txt  = _sRoot?.querySelector('.fop-progress-txt');
                if (fill) fill.style.width = pct + '%';
                if (txt)  txt.textContent  = pct + '%';
            }

            function _resetFooterCancel() {
                const footer = _sRoot?.querySelector('.fop-footer');
                if (!footer) return;
                footer.innerHTML = `<button class="fop-cancel-btn">${_('Cancel')}</button>`;
                footer.querySelector('.fop-cancel-btn')?.addEventListener('click', () => _abort());
            }

            function _showEvent(type, msg) {
                _paused = true;
                clearInterval(_iv); _iv = null;
                _setPb(type === 'fail' ? 'fail' : 'warn');
                const footer = _sRoot?.querySelector('.fop-footer');
                if (!footer) return;

                if (type === 'fail') {
                    footer.innerHTML = `
                        <span class="fop-error-msg">${msg}</span>
                        <button class="fop-retry-btn">${_('Try again')}</button>
                        <button class="fop-abort-btn">${_('Cancel')}</button>`;
                    footer.querySelector('.fop-retry-btn')?.addEventListener('click', () => {
                        _setPb(''); _paused = false; _resetFooterCancel(); _runSim();
                    });
                    footer.querySelector('.fop-abort-btn')?.addEventListener('click', _abort);

                } else if (type === 'warn') {
                    footer.innerHTML = `
                        <span class="fop-warn-msg">${msg}</span>
                        <button class="fop-close-warn-btn">${_('Close')}</button>`;
                    footer.querySelector('.fop-close-warn-btn')?.addEventListener('click', () => {
                        _setPb(''); _paused = false; _resetFooterCancel(); _runSim();
                    });

                } else {
                    footer.innerHTML = `
                        <span class="fop-note-msg">${msg}</span>
                        <button class="fop-skip-btn">${_('Skip')}</button>
                        <button class="fop-abort-btn">${_('Cancel')}</button>`;
                    footer.querySelector('.fop-skip-btn')?.addEventListener('click', () => {
                        _done++; _updatePct();
                        _setPb(''); _paused = false; _resetFooterCancel(); _runSim();
                    });
                    footer.querySelector('.fop-abort-btn')?.addEventListener('click', _abort);
                }
            }

            function _runSim() {
                if (_done >= total) { _finish(); return; }
                _iv = setInterval(() => {
                    if (!_sRoot || !document.contains(_sRoot)) { clearInterval(_iv); return; }
                    if (_paused) return;
                    const rows = _sRoot.querySelectorAll('.fop-item');
                    if (rows[_done]) {
                        rows[_done].querySelector('.fop-item-status').className = 'fop-item-status fop-item-active';
                        rows[_done].querySelector('.fop-item-state').textContent = _('Moving…');
                    }
                    setTimeout(() => {
                        if (!_sRoot || _paused) return;
                        // Simulate events (skip last item to always finish)
                        const rand = _done < total - 1 ? Math.random() : 1;
                        if (rand < 0.18) {
                            if (rows[_done]) {
                                rows[_done].querySelector('.fop-item-status').className = 'fop-item-status fop-item-error';
                                rows[_done].querySelector('.fop-item-state').textContent = _('Failed');
                            }
                            clearInterval(_iv); _iv = null;
                            _showEvent('fail', _('Access denied') + ': ' + (items[_done]?.name || ''));
                        } else if (rand < 0.33) {
                            if (rows[_done]) {
                                rows[_done].querySelector('.fop-item-status').className = 'fop-item-status fop-item-warn';
                                rows[_done].querySelector('.fop-item-state').textContent = _('Warning');
                            }
                            clearInterval(_iv); _iv = null;
                            _showEvent('warn', _('File already exists') + ': ' + (items[_done]?.name || ''));
                        } else if (rand < 0.43) {
                            if (rows[_done]) {
                                rows[_done].querySelector('.fop-item-status').className = 'fop-item-status fop-item-note';
                                rows[_done].querySelector('.fop-item-state').textContent = _('Note');
                            }
                            clearInterval(_iv); _iv = null;
                            _showEvent('note', _('Symbolic link') + ': ' + (items[_done]?.name || ''));
                        } else {
                            if (rows[_done]) {
                                rows[_done].querySelector('.fop-item-status').className = 'fop-item-status fop-item-done';
                                rows[_done].querySelector('.fop-item-state').textContent = _('Done');
                            }
                            _done++;
                            _updatePct();
                            if (_done >= total) { clearInterval(_iv); _iv = null; _finish(); }
                        }
                    }, 320);
                }, 600);
            }

            function _finish() {
                _updatePct();
                try {
                    app.explorer.pasteItems(items.map(i => i.path), mode, toPath);
                    app.dev.log(`Drag-drop finished: ${mode} ${total} item(s) → "${toPath}"`, 'Explorer');
                    _showClose('success', verbed + ' ' + total + ' ' + (total === 1 ? _('item') : _('items')));
                } catch (err) {
                    app.dev.error(`Drag-drop failed to commit ${mode} → "${toPath}": ${err}`, 'Explorer');
                    _showClose('error', _('Operation failed') + ': ' + (err?.message || err));
                }
            }

            function _closeThisWindow() {
                app.ui.windows.functions.close(wid, 'explorer', 'explorer', false, false);
            }

            function _showClose(state, msg) {
                const footer = _sRoot?.querySelector('.fop-footer');
                if (!footer) return;

                if (state === 'success') {
                    footer.innerHTML = `<span class="fop-done-msg">${msg}</span>`;
                    setTimeout(() => {
                        if (document.body.contains(_sRoot)) _closeThisWindow();
                    }, 900);
                    return;
                }

                const cls = state === 'cancel' ? 'fop-warn-msg' : 'fop-error-msg';
                footer.innerHTML = `
                    <span class="${cls}">${msg}</span>
                    <button class="fop-close-btn">${_('Close')}</button>`;
                footer.querySelector('.fop-close-btn')?.addEventListener('click', _closeThisWindow);
            }

            return `<div class="fop-root">
                <div class="fop-header">
                    <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                    <span>${verbing} ${total} ${total === 1 ? _('item') : _('items')}</span>
                </div>
                <div class="fop-paths">
                    <div class="fop-path-row"><span class="fop-label">${_('From')}</span><span class="fop-path">${app.util.escapeHtml(fromPath)}</span></div>
                    <div class="fop-path-row"><span class="fop-label">${_('To')}</span><span class="fop-path">${app.util.escapeHtml(toPath)}</span></div>
                </div>
                <div class="fop-progress-wrap">
                    <div class="fop-progress-bar"><div class="fop-progress-fill" style="width:0%"></div></div>
                    <span class="fop-progress-txt">0%</span>
                </div>
                <div class="fop-items">
                    ${items.map(item => `
                        <div class="fop-item">
                            <span class="fop-item-status fop-item-pending">●</span>
                            <span class="fop-item-name">${app.util.escapeHtml(item.name)}</span>
                            <span class="fop-item-state">${_('Pending')}</span>
                        </div>`).join('')}
                </div>
                <div class="fop-footer">
                    <button class="fop-cancel-btn">${_('Cancel')}</button>
                </div>
            </div>`;
        }
    });
}

/**
 * Delegated click/contextmenu handling for the side panel (tree expand/
 * collapse, favorites navigation, tree row context menu).
 *
 * @param {Object} state
 * @returns {void}
 */
export function bindSideRows(state) {
    if (!state.winRoot) return;
    const sideBody = state.winRoot.querySelector('.exp-side-body');
    if (!sideBody) return;
    sideBody.addEventListener('click', e => {
        const treeRow = e.target.closest('.exp-tree-row');
        const favRow  = e.target.closest('.exp-fav-row');
        if (treeRow) {
            const p = treeRow.dataset.path;
            if (state.expanded.has(p)) {
                state.expanded.delete(p);
                treeCollapse(state, p);
                const svgs = treeRow.querySelectorAll('svg');
                if (svgs[0]) svgs[0].style.transform = 'rotate(0deg)';
                if (svgs[1]) {
                    const use = svgs[1].querySelector('use');
                    if (use) {
                        svgs[1].style.color = '#fbbf24';
                        use.setAttribute('href', '#ic-folder');
                    }
                }
            } else {
                state.expanded.add(p);
                treeExpand(state, treeRow, p);
                const svgs = treeRow.querySelectorAll('svg');
                if (svgs[0]) svgs[0].style.transform = 'rotate(90deg)';
                if (svgs[1]) {
                    const use = svgs[1].querySelector('use');
                    if (use) {
                        svgs[1].style.color = '#facc15';
                        use.setAttribute('href', '#ic-folder-open');
                    }
                }
            }
            state.winRoot.querySelectorAll('.exp-tree-row').forEach(r => r.classList.toggle('active', r.dataset.path === p));
            clearSearch(state);
            state.path = p;
            if (state.histIdx < state.history.length - 1) state.history.splice(state.histIdx + 1);
            if (state.history[state.histIdx] !== p) { state.history.push(p); state.histIdx = state.history.length - 1; }
            updateMain(state);

            if (isRealStoragePath(p)) {
                ensureRealFolderLoaded(state, p).then(() => {
                    if (state.path === p) updateMain(state);
                });
            }
        } else if (favRow) {
            navigate(state, favRow.dataset.path);
        }
    });

    let _contextTreePath = null;
    sideBody.addEventListener('contextmenu', e => {
        const row = e.target.closest('.exp-tree-row');
        _contextTreePath = row?.dataset?.path ?? null;
    }, true);
    app.ui.contextMenu(sideBody, {
        exclude: '.exp-fav-row',
        callback: () => _contextTreePath ? treeRowMenu(state, _contextTreePath) : null
    });
}
