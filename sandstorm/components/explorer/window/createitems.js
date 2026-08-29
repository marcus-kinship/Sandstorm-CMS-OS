/**
 * @file explorer/window/createitems.js
 * @description Inline new-folder/new-file creation: inserts an editable
 * placeholder row/grid-item at the top of the list, commits via
 * `app.explorer.newFolder`/`newFile` on blur/Enter, or discards on Escape.
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes. Each function takes `state` as its first parameter instead
 * of closing over free variables.
 *
 * Note: the original assigned `app.explorer._activeStartInlineNewFolder`/
 * `_activeStartInlineNewFile` to these functions directly (an implicit
 * per-window closure, since it captured that window's local `_path`/
 * `_view`/etc.). Since these are now plain functions taking `state`
 * explicitly, that binding is done by window/index.js instead — as
 * `() => startInlineNewFolder(state)` — at the exact two call sites the
 * original bound it (right after `start(os)` builds the window, and again
 * whenever the window is focused), so "route to whichever Explorer window
 * was last interacted with" behaves identically.
 *
 * @module components/explorer/window/createitems
 */
import { renderList } from './list.js';
import { bindRows } from './rows.js';
import { extIcon } from './icons.js';
import { animatedFolderIcon } from './icons.js';

/**
 * Starts inline creation of a new folder in the current view.
 *
 * @param {Object} state
 * @returns {void}
 */
export function startInlineNewFolder(state) {
    if (!state.winRoot) return;
    if (state.winRoot.querySelector('.exp-new-folder-input')) return; // already open

    const listBody = state.winRoot.querySelector('.exp-list-body');
    if (!listBody) return;

    const _folderSVG16 = `<svg width="16" height="16" style="color:#fbbf24;flex-shrink:0;"><use href="#ic-folder"></use></svg>`;
    const _inputBase  = 'background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.4);color:#fff;border-radius:3px;outline:none;';

    const _commit = (input, container) => {
        const name = input.value.trim().replace(/\//g, '');
        container.remove();
        if (name) app.explorer.newFolder((state.path === '/' ? '' : state.path) + '/' + name);
    };

    const _bindInput = (input, container) => {
        let _cancelled = false;
        setTimeout(() => {
            input.focus();
            input.setSelectionRange(0, input.value.length);
            requestAnimationFrame(() => app.ui.caret?.position?.update?.(input));
        }, 30);
        input.addEventListener('blur', () => { if (!_cancelled) _commit(input, container); });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { e.preventDefault(); _cancelled = true; container.remove(); }
        });
    };

    if (state.view === 'grid') {
        let grid = listBody.querySelector('.exp-grid');
        if (!grid) { listBody.innerHTML = renderList(state); grid = listBody.querySelector('.exp-grid'); bindRows(state); }
        if (!grid) return;

        const item = document.createElement('div');
        item.className = 'exp-grid-item exp-visible exp-new-folder-item';
        item.innerHTML = animatedFolderIcon(state, { type: 'folder', children: {} }, 32);

        const input = document.createElement('input');
        input.type  = 'text';
        input.value = _('New Folder');
        input.className = 'exp-new-folder-input';
        input.style.cssText = _inputBase + 'padding:2px 4px;font-size:11px;width:80px;text-align:center;margin-top:4px;display:block;';
        item.appendChild(input);
        grid.prepend(item);
        _bindInput(input, item);
    } else {
        let tbody = listBody.querySelector('.exp-table tbody');
        if (!tbody) { listBody.innerHTML = renderList(state); tbody = listBody.querySelector('.exp-table tbody'); bindRows(state); }
        if (!tbody) return;

        const row = document.createElement('tr');
        row.className = 'exp-row exp-visible exp-new-folder-row';

        const nameTd = document.createElement('td');
        nameTd.style.cssText = 'display:flex;align-items:center;gap:6px;';
        nameTd.innerHTML = _folderSVG16;

        const input = document.createElement('input');
        input.type  = 'text';
        input.value = _('New Folder');
        input.className = 'exp-new-folder-input';
        input.style.cssText = _inputBase + 'padding:1px 6px;font-size:12px;width:180px;';
        nameTd.appendChild(input);

        row.appendChild(nameTd);
        row.insertAdjacentHTML('beforeend',
            `<td data-col="type">${_('Folder')}</td><td data-col="modified">—</td><td data-col="size" style="text-align:right;">—</td>`);
        tbody.prepend(row);
        _bindInput(input, row);
    }
}

/**
 * Starts inline creation of a new file (default extension "txt") in the current view.
 *
 * @param {Object} state
 * @param {string} [ext='txt']
 * @returns {void}
 */
export function startInlineNewFile(state, ext = 'txt') {
    if (!state.winRoot) return;
    if (state.winRoot.querySelector('.exp-new-folder-input')) return;

    const listBody = state.winRoot.querySelector('.exp-list-body');
    if (!listBody) return;

    const _fileIcon16 = extIcon(ext, 16);
    const _fileIcon32 = extIcon(ext, 32);
    const _inputBase  = 'background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.4);color:#fff;border-radius:3px;outline:none;';
    const defaultName = `${_('New file')}.${ext}`;

    const _commit = (input, container) => {
        let name = input.value.trim().replace(/\//g, '');
        container.remove();
        if (!name) return;
        if (!name.toLowerCase().endsWith('.' + ext)) {
            name = name.replace(/\.[^.]*$/, '') + '.' + ext;
        }
        app.explorer.newFile((state.path === '/' ? '' : state.path) + '/' + name);
    };

    const _bindInput = (input, container) => {
        let _cancelled = false;
        setTimeout(() => {
            input.focus();
            const dotIdx = input.value.lastIndexOf('.');
            input.setSelectionRange(0, dotIdx > 0 ? dotIdx : input.value.length);
            requestAnimationFrame(() => app.ui.caret?.position?.update?.(input));
        }, 30);
        input.addEventListener('blur', () => { if (!_cancelled) _commit(input, container); });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { e.preventDefault(); _cancelled = true; container.remove(); }
        });
    };

    if (state.view === 'grid') {
        let grid = listBody.querySelector('.exp-grid');
        if (!grid) { listBody.innerHTML = renderList(state); grid = listBody.querySelector('.exp-grid'); bindRows(state); }
        if (!grid) return;

        const item = document.createElement('div');
        item.className = 'exp-grid-item exp-visible exp-new-folder-item';
        item.innerHTML = _fileIcon32;

        const input = document.createElement('input');
        input.type  = 'text';
        input.value = defaultName;
        input.className = 'exp-new-folder-input';
        input.style.cssText = _inputBase + 'padding:2px 4px;font-size:11px;width:80px;text-align:center;margin-top:4px;display:block;';
        item.appendChild(input);
        grid.prepend(item);
        _bindInput(input, item);
    } else {
        let tbody = listBody.querySelector('.exp-table tbody');
        if (!tbody) { listBody.innerHTML = renderList(state); tbody = listBody.querySelector('.exp-table tbody'); bindRows(state); }
        if (!tbody) return;

        const row = document.createElement('tr');
        row.className = 'exp-row exp-visible exp-new-folder-row';

        const nameTd = document.createElement('td');
        nameTd.style.cssText = 'display:flex;align-items:center;gap:6px;';
        nameTd.innerHTML = _fileIcon16;

        const input = document.createElement('input');
        input.type  = 'text';
        input.value = defaultName;
        input.className = 'exp-new-folder-input';
        input.style.cssText = _inputBase + 'padding:1px 6px;font-size:12px;width:180px;';
        nameTd.appendChild(input);

        row.appendChild(nameTd);
        row.insertAdjacentHTML('beforeend',
            `<td data-col="type">${ext.toUpperCase()}</td><td data-col="modified">—</td><td data-col="size" style="text-align:right;">0 B</td>`);
        tbody.prepend(row);
        _bindInput(input, row);
    }
}
