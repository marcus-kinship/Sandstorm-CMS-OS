/**
 * @file explorer/window/dialogmode.js
 * @description Converts a normal Explorer window into an open/save/folder-
 * picker dialog: applies the type filter, swaps the footer for
 * confirm/cancel controls (+ name field for save, read-only path field for
 * folder), and resolves the dialog's promise (see
 * `app.explorer.windows.fileDialog` in explorer/setup/dialogs.js) once the
 * user confirms, cancels, or double-clicks a file.
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes. Takes `state` as its first parameter instead of closing
 * over free variables.
 *
 * @module components/explorer/window/dialogmode
 */
import { node } from './fsutil.js';
import { update } from './core.js';

/**
 * @param {Object} state
 * @param {{mode: string, options: Object, resolve: Function, _pendingResult?: *}} dialog
 * @param {Object} windowobj
 * @returns {void}
 */
export function setupDialogMode(state, dialog, windowobj) {
    app.dev.log(`[Dialog] setupDialogMode mode=${dialog.mode} winEl=${!!(windowobj?.el?.[0])} winRoot=${!!state.winRoot}`, 'Explorer');
    state.isDialog = true;
    const { mode, options = {}, resolve } = dialog;
    const types    = (options.types || []).map(t => t.toLowerCase());
    const multiple = mode === 'open' && !!options.multiple;
    const max      = options.max || (multiple ? Infinity : 1);

    // Apply type filter and re-render
    state.dialogTypes = types;
    update(state);

    // windowobj.el[0] is set by windowStart before setTimeout fires — guaranteed correct window
    const winEl = windowobj?.el?.[0] ?? state.winRoot.closest('.window');
    const titleEl = winEl?.querySelector('.window-header .title');
    if (titleEl) titleEl.textContent = mode === 'folder' ? _('Select Folder') : mode === 'save' ? _('Save File') : _('Open File');

    // Hide meta panel to save space
    const metaEl = state.winRoot.querySelector('.exp-meta');
    if (metaEl) metaEl.style.display = 'none';

    // ── Build controls directly into the existing .exp-footer ────────────
    const expFooter = state.winRoot.querySelector('.exp-footer');
    if (!expFooter) return;

    expFooter.innerHTML = '';
    expFooter.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;';

    const _makeBtn = (label, primary) => {
        const b = document.createElement('button');
        b.className   = 'aero-button';
        b.textContent = label;
        if (primary) {
            const pulse = document.createElement('div');
            pulse.className = 'after pulse';
            b.appendChild(pulse);
        }
        return b;
    };

    let _nameInput, _extSelect;

    if (mode === 'save') {
        _nameInput = document.createElement('input');
        _nameInput.type        = 'text';
        _nameInput.placeholder = _('File name');
        _nameInput.className   = 'input';

        if (types.length > 0) {
            _extSelect = document.createElement('select');
            _extSelect.className = 'input';
            types.forEach(ext => {
                const opt = document.createElement('option');
                opt.value       = ext;
                opt.textContent = '.' + ext;
                _extSelect.appendChild(opt);
            });
            _extSelect.addEventListener('change', () => {
                const v = _nameInput.value.trim();
                if (v) _nameInput.value = v.replace(/\.[^.]*$/, '') + '.' + _extSelect.value;
            });
        }

        expFooter.appendChild(_nameInput);
        if (_extSelect) expFooter.appendChild(_extSelect);
    } else {
        _nameInput          = document.createElement('input');
        _nameInput.type     = 'text';
        _nameInput.readOnly = true;
        _nameInput.className = 'input';
        if (mode === 'folder') {
            _nameInput.value       = state.path || '/';
            _nameInput.placeholder = _('Navigate to folder');
        } else {
            _nameInput.placeholder = multiple ? _('No files selected') : _('No file selected');
        }
        expFooter.appendChild(_nameInput);
    }

    const _btnOk     = _makeBtn(mode === 'save' ? _('Save') : _('Open'), true);
    const _btnCancel = _makeBtn(_('Cancel'), false);
    if (mode === 'open') { _btnOk.disabled = true; _btnOk.style.opacity = '0.45'; }
    expFooter.appendChild(_btnOk);
    expFooter.appendChild(_btnCancel);

    // ── Selection → update footer ─────────────────────────────────────────
    const _selFiles = () =>
        [...(state.winRoot.querySelectorAll('.exp-row.exp-selected, .exp-grid-item.exp-selected'))]
        .map(el => el.dataset.path)
        .filter(p => p && node(p)?.type === 'file');

    const _updateFooter = () => {
        if (mode === 'folder') { _nameInput.value = state.path || '/'; return; }
        const sel = _selFiles();
        if (mode === 'open') {
            if (sel.length === 0) {
                _nameInput.value = '';
                _btnOk.disabled = true; _btnOk.style.opacity = '0.45';
            } else {
                _nameInput.value = sel.length === 1
                    ? sel[0].split('/').pop()
                    : sel.length + ' ' + _('files selected');
                _btnOk.disabled = false; _btnOk.style.opacity = '1';
            }
        } else if (sel.length === 1) {
            const name = sel[0].split('/').pop();
            const base = name.includes('.') ? name.replace(/\.[^.]*$/, '') : name;
            _nameInput.value = base;
            const ext = name.split('.').pop().toLowerCase();
            if (_extSelect && types.includes(ext)) _extSelect.value = ext;
        }
    };

    // MutationObserver watches class changes on list rows + breadcrumb (for folder mode)
    const _mo = new MutationObserver(_updateFooter);
    const listBody = state.winRoot.querySelector('.exp-list-body');
    if (listBody) _mo.observe(listBody, { attributes: true, subtree: true, attributeFilter: ['class'] });
    if (mode === 'folder') {
        const crumb = state.winRoot.querySelector('.exp-breadcrumb');
        if (crumb) _mo.observe(crumb, { childList: true, subtree: true });
    }

    // ── Resolve guard ─────────────────────────────────────────────────────
    const _finish = (val) => {
        if (dialog._pendingResult !== undefined) { app.dev.log('[Dialog] _finish: already set', 'Explorer'); return; }
        dialog._pendingResult = val; // stored on dialog obj — read by state.close in body()
        state.dialogTypes = [];
        _mo.disconnect();
        app.dev.log(`[Dialog] _finish: stored result="${val}", closing window`, 'Explorer');
        windowobj.close(); // triggers state.close → resolve()
    };

    // OK
    _btnOk.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mode === 'folder') {
            _finish(state.path || '/');
        } else if (mode === 'open') {
            const sel = _selFiles().slice(0, max);
            if (!sel.length) return;
            _finish(multiple ? sel : sel[0]);
        } else {
            let name = _nameInput.value.trim();
            if (!name) return;
            const ext = _extSelect ? _extSelect.value : (types[0] || '');
            if (ext && !name.toLowerCase().endsWith('.' + ext))
                name = name.replace(/\.[^.]*$/, '') + '.' + ext;
            _finish((state.path === '/' ? '' : state.path) + '/' + name);
        }
    });

    // Cancel
    _btnCancel.addEventListener('click', (e) => { e.stopPropagation(); _finish(null); });

    // Double-click a file row → confirm immediately
    listBody?.addEventListener('dblclick', e => {
        const row = e.target.closest('[data-path]');
        if (!row || node(row.dataset.path)?.type !== 'file') return;
        if (mode === 'open') {
            _finish(multiple ? [row.dataset.path] : row.dataset.path);
        }
    });
}
