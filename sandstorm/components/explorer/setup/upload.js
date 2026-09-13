/**
 * @file explorer/setup/upload.js
 * @description Native OS file drag-and-drop: lets the user pick files in
 * their own OS (Windows Explorer, macOS Finder, the desktop, ...) and drag
 * them onto this web page to import/upload them — as opposed to
 * `window/dragdrop.js`, which is entirely about dragging *Explorer's own*
 * rows onto folder targets. The two systems never collide: `dragdrop.js`'s
 * drags are driven by `app.ui.dragDrop`'s custom mouse-event ghost-drag
 * (see ui.js) and desktop/icons.js's own jQuery-UI `.draggable()`, neither
 * of which fires real `dragenter`/`dragover`/`drop` DOM events — only an
 * actual native OS drag does, and only a native drag ever carries
 * `e.dataTransfer.types.includes('Files')`. Every listener here is gated on
 * that check, so an internal Explorer drag (or any other native drag that
 * isn't files — a link, selected text, ...) is completely invisible to it.
 *
 * Registered ONCE at boot (`registerUpload(os)`, called from setup/index.js
 * next to registerFileOps), on `document` — NOT per Explorer window like
 * dragdrop.js's `bindDragDrop`. This is deliberate: a drop should work
 * immediately on the empty desktop even if no Explorer window is open yet,
 * and a single global listener naturally covers "drop on the desktop" AND
 * "drop on any open Explorer window" (in fact any number of them) without
 * needing its own bind/unbind lifecycle per window.
 *
 * Reuses `window/dragdrop.js`'s `resolveDropTargetPath`/`DROP_TARGET_SELECTOR`
 * for hit-testing — one definition of "what counts as a droppable folder
 * target" for BOTH drag systems, not two that could drift apart. The actual
 * per-file write goes through `app.explorer.uploadFile` (setup/fileops.js),
 * which already knows how to branch on `/RealStorage` vs the simulated tree
 * — this module only owns the native-event plumbing and the progress UI.
 *
 * No custom hover-highlight CSS: `e.dataTransfer.dropEffect` is set to
 * `'copy'`/`'none'` on the resolved target, which is enough for the browser
 * to show the OS's own copy-disallowed cursor — the same "the cursor IS the
 * feedback, not a border on the target" convention `window/dragdrop.js`'s
 * own (unstyled) `.dd-over`/`.dd-over-deny` already use for internal drags
 * (see ARKITEKTUR.md). `.desktop-icons.dd-drop-active` — the existing
 * pointer-events toggle `bindDragDrop`'s `onStart`/`onCancel` use to make
 * empty desktop space hit-testable during an internal drag — is reused
 * as-is here for the same reason during a native one.
 *
 * @module components/explorer/setup/upload
 */
import { resolveDropTargetPath, DROP_TARGET_SELECTOR } from '../window/dragdrop.js';

/**
 * Registers the global native-file-drop listener. Boot-safe — does not
 * require an Explorer window to exist yet.
 *
 * @param {Object} os - The OS/program API (threaded through to
 *   `openUploadStatus`, which needs it for `os.ui.windowStart`, exactly
 *   like `dragdrop.js`'s `openMoveStatus` needs `state.os` for the same
 *   reason).
 * @returns {void}
 */
export function registerUpload(os) {
    const _desktopIcons = () => document.querySelector('.desktop-icons');

    function _isFileDrag(e) {
        return !!e.dataTransfer && Array.prototype.includes.call(e.dataTransfer.types || [], 'Files');
    }

    function _targetFor(e) {
        const tgt = e.target instanceof Element ? e.target.closest(DROP_TARGET_SELECTOR) : null;
        return resolveDropTargetPath(tgt);
    }

    document.addEventListener('dragenter', e => {
        if (!_isFileDrag(e)) return;
        e.preventDefault();
        _desktopIcons()?.classList.add('dd-drop-active');
    });

    document.addEventListener('dragover', e => {
        if (!_isFileDrag(e)) return;
        e.preventDefault(); // required for `drop` to ever fire at all
        e.dataTransfer.dropEffect = _targetFor(e) ? 'copy' : 'none';
    });

    document.addEventListener('dragleave', e => {
        if (!_isFileDrag(e)) return;
        // Only clear once the drag has actually left the page — dragleave
        // also fires (with a relatedTarget) every time it merely crosses
        // from one child element into another, which would otherwise flash
        // the desktop's hit-testable state on/off constantly mid-drag.
        if (e.relatedTarget === null) _desktopIcons()?.classList.remove('dd-drop-active');
    });

    document.addEventListener('drop', e => {
        if (!_isFileDrag(e)) return;
        e.preventDefault(); // otherwise the browser navigates to/opens the dropped file
        _desktopIcons()?.classList.remove('dd-drop-active');

        const toPath = _targetFor(e);
        const files  = [...(e.dataTransfer.files || [])];
        if (!toPath || !files.length) return; // dropped somewhere that isn't a valid target — ignore

        app.dev.log(`Native file drop: ${files.length} file(s) → "${toPath}"`, 'Explorer');
        openUploadStatus(os, files, toPath);
    });
}

/**
 * Opens the upload progress window and, one file at a time, actually
 * performs the upload via `app.explorer.uploadFile`. Unlike
 * `dragdrop.js`'s `openMoveStatus` (whose per-item timing is a cosmetic
 * simulation — the real filesystem change happens once, after), this drives
 * its progress bar off the REAL upload of each file, because upload latency
 * (network + a potentially large file) genuinely varies file to file and a
 * simulated timer would be actively misleading here.
 *
 * @param {Object} os
 * @param {File[]} files
 * @param {string} toPath
 * @returns {void}
 */
export function openUploadStatus(os, files, toPath) {
    const total   = files.length;
    const winH    = Math.min(530, Math.max(300, 220 + total * 30)) + 'px';
    const uid     = 'fup-' + Date.now();
    let _sRoot    = null;
    let _idx      = 0;
    let _done     = 0;
    let _aborted  = false;
    let _paused   = false;

    os.ui.windowStart('explorer', {
        id:        uid,
        title:     _('Uploading') + ' ' + total + ' ' + (total === 1 ? _('item') : _('items')),
        width:     '460px',
        height:    winH,
        resizable: false,
        body(windowobj) {
            const wid = windowobj?.windowId || (uid + '-0');

            setTimeout(() => {
                _sRoot = document.querySelector(`#${wid}-win .fup-root`);
                if (!_sRoot) return;
                _sRoot.querySelector('.fup-cancel-btn')?.addEventListener('click', () => _abort());
                _next();
            }, 0);

            function _abort() {
                _aborted = true;
                _sRoot?.querySelectorAll('.fop-item').forEach((row, i) => {
                    if (i >= _done && i !== _idx) {
                        row.querySelector('.fop-item-status').className = 'fop-item-status fop-item-error';
                        row.querySelector('.fop-item-state').textContent = _('Cancelled');
                    }
                });
                _showClose('cancel', _('Operation cancelled'));
            }

            function _setPb(state) {
                const f = _sRoot?.querySelector('.fop-progress-fill');
                if (f) f.className = 'fop-progress-fill' + (state === 'fail' ? ' fop-pb-fail' : '');
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
                footer.innerHTML = `<button class="fup-cancel-btn fop-cancel-btn">${_('Cancel')}</button>`;
                footer.querySelector('.fup-cancel-btn')?.addEventListener('click', () => _abort());
            }

            function _showFail(msg) {
                _paused = true;
                _setPb('fail');
                const footer = _sRoot?.querySelector('.fop-footer');
                if (!footer) return;
                footer.innerHTML = `
                    <span class="fop-error-msg">${app.util.escapeHtml(msg)}</span>
                    <button class="fup-skip-btn">${_('Skip')}</button>
                    <button class="fup-abort-btn">${_('Cancel')}</button>`;
                footer.querySelector('.fup-skip-btn')?.addEventListener('click', () => {
                    _idx++; _setPb(''); _paused = false; _resetFooterCancel(); _next();
                });
                footer.querySelector('.fup-abort-btn')?.addEventListener('click', _abort);
            }

            function _next() {
                if (_aborted) return;
                if (_idx >= total) { _finish(); return; }

                const file = files[_idx];
                const row  = _sRoot?.querySelectorAll('.fop-item')[_idx];
                if (row) {
                    row.querySelector('.fop-item-status').className = 'fop-item-status fop-item-active';
                    row.querySelector('.fop-item-state').textContent = _('Uploading…');
                }

                app.explorer.uploadFile(toPath, file).then(() => {
                    if (_aborted || _paused) return;
                    if (row) {
                        row.querySelector('.fop-item-status').className = 'fop-item-status fop-item-done';
                        row.querySelector('.fop-item-state').textContent = _('Done');
                    }
                    _idx++; _done++;
                    _updatePct();
                    _next();
                }).catch(err => {
                    if (_aborted) return;
                    if (row) {
                        row.querySelector('.fop-item-status').className = 'fop-item-status fop-item-error';
                        row.querySelector('.fop-item-state').textContent = _('Failed');
                    }
                    app.dev.error(`uploadFile failed for "${file.name}": ${err?.message || err}`, 'Explorer');
                    _showFail((err?.message || _('Upload failed')) + ': ' + file.name);
                });
            }

            function _finish() {
                _updatePct();
                app.dev.log(`Native file drop finished: ${total} item(s) → "${toPath}"`, 'Explorer');
                _showClose('success', _('Uploaded') + ' ' + total + ' ' + (total === 1 ? _('item') : _('items')));
            }

            function _closeThisWindow() {
                app.ui.windows.functions.close(wid, 'explorer', 'explorer', false, false);
            }

            function _showClose(state, msg) {
                const footer = _sRoot?.querySelector('.fop-footer');
                if (!footer) return;

                if (state === 'success') {
                    footer.innerHTML = `<span class="fop-done-msg">${app.util.escapeHtml(msg)}</span>`;
                    setTimeout(() => { if (document.body.contains(_sRoot)) _closeThisWindow(); }, 900);
                    return;
                }

                const cls = state === 'cancel' ? 'fop-warn-msg' : 'fop-error-msg';
                footer.innerHTML = `
                    <span class="${cls}">${app.util.escapeHtml(msg)}</span>
                    <button class="fup-close-btn">${_('Close')}</button>`;
                footer.querySelector('.fup-close-btn')?.addEventListener('click', _closeThisWindow);
            }

            return `<div class="fup-root fop-root">
                <div class="fop-header">
                    <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
                    <span>${_('Uploading')} ${total} ${total === 1 ? _('item') : _('items')}</span>
                </div>
                <div class="fop-paths">
                    <div class="fop-path-row"><span class="fop-label">${_('To')}</span><span class="fop-path">${app.util.escapeHtml(toPath)}</span></div>
                </div>
                <div class="fop-progress-wrap">
                    <div class="fop-progress-bar"><div class="fop-progress-fill" style="width:0%"></div></div>
                    <span class="fop-progress-txt">0%</span>
                </div>
                <div class="fop-items">
                    ${files.map(f => `
                        <div class="fop-item">
                            <span class="fop-item-status fop-item-pending">●</span>
                            <span class="fop-item-name">${app.util.escapeHtml(f.name)}</span>
                            <span class="fop-item-state">${_('Pending')}</span>
                        </div>`).join('')}
                </div>
                <div class="fop-footer">
                    <button class="fup-cancel-btn fop-cancel-btn">${_('Cancel')}</button>
                </div>
            </div>`;
        }
    });
}
