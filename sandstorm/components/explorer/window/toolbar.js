/**
 * @file explorer/window/toolbar.js
 * @description Wires every toolbar/panel DOM control for a freshly-rendered
 * Explorer window: activity-bar tabs, view toggle, back/forward/up, the
 * Edit-menu dropdown, header search + filter panel, breadcrumb toggle,
 * refresh, meta-panel toggle, nav-lock, touch nav, the desktop shortcut
 * button, import/upload local files, infinite scroll + box-select, drag-
 * and-drop, the shared `.exp-main` context menu, and side-panel row
 * delegation.
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes. `bindWindowEvents(state, wid)` is called once from
 * window/index.js's `body()`, after `state.winRoot` is resolved.
 *
 * @module components/explorer/window/toolbar
 */
import { node, tooltip } from './fsutil.js';
import { folderIcon, fileIcon } from './icons.js';
import { hasActiveFilters, searchMatches, clearSearch } from './search.js';
import { renderSideContent } from './tree.js';
import { loadMoreItems } from './list.js';
import { updateMeta } from './meta.js';
import { update, updateMain, updateSide, navigate } from './core.js';
import { editToolbarMenu } from './menus.js';
import { closeCrumbDropdown } from './breadcrumb.js';
import { bindDragDrop, bindSideDragDrop, bindSideRows, bindExternalDrop } from './dragdrop.js';

/**
 * Wires all toolbar/panel/list-area DOM controls for the window.
 *
 * @param {Object} state
 * @param {string} wid - The window's DOM id (`windowobj.windowId`).
 * @returns {void}
 */
export function bindWindowEvents(state, wid) {
    const winRoot = state.winRoot;

    // Activity bar (only tab buttons with data-panel)
    winRoot.querySelectorAll('.exp-act-btn[data-panel]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.panel === btn.dataset.panel) return; // already showing this tab
            state.panel = btn.dataset.panel;
            updateSide(state);
        });
    });

    // View toggle
    winRoot.querySelectorAll('.exp-view-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            app.dev.log(`View change → ${btn.dataset.view}`, 'Explorer');
            state.view = btn.dataset.view;
            update(state);
        });
    });

    // Navigation
    winRoot.querySelector('.exp-back')?.addEventListener('click', () => {
        if (state.histIdx > 0) {
            clearSearch(state);
            state.histIdx--; state.path = state.history[state.histIdx]; update(state);
        }
    });
    winRoot.querySelector('.exp-fwd')?.addEventListener('click', () => {
        if (state.histIdx < state.history.length - 1) {
            clearSearch(state);
            state.histIdx++; state.path = state.history[state.histIdx]; update(state);
        }
    });
    winRoot.querySelector('.exp-up')?.addEventListener('click', () => {
        if (state.path === '/') return;
        const parent = state.path.split('/').slice(0, -1).join('/') || '/';
        navigate(state, parent);
    });

    // Edit menu button — click opens Copy/Cut/Paste/New dropdown
    const editMenuBtn = winRoot.querySelector('.exp-edit-menu-btn');
    if (editMenuBtn) {
        app.ui.contextMenu(editMenuBtn, { callback: () => editToolbarMenu(state) });
        editMenuBtn.addEventListener('click', e => {
            e.stopPropagation();
            const rect = editMenuBtn.getBoundingClientRect();
            editMenuBtn.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true, cancelable: true,
                clientX: rect.left, clientY: rect.bottom + 4,
            }));
        });
    }

    // Header search — drives both the side-panel tree (compact,
    // capped at 30 matches, for quick jumping) and the main list
    // (.exp-list-body via state.searchQuery/renderSearchResults, full
    // result set with type/modified/size columns and exp-meta
    // support, exactly like a normal folder listing).
    function _refreshSearchViews() {
        updateMain(state);

        const sideBody = winRoot.querySelector('.exp-side-body');
        if (!sideBody) return;
        if (!state.searchQuery.trim()) { sideBody.innerHTML = renderSideContent(state); bindSideRows(state); return; }
        const matches = searchMatches(state, state.searchQuery);
        if (matches.length === 0) {
            sideBody.innerHTML = `<div style="padding:12px 10px;opacity:0.4;font-size:11px;">${_('No results')}</div>`;
        } else {
            sideBody.innerHTML = matches.slice(0, 30).map(m => `
                <div class="exp-tree-row" data-path="${app.util.escapeHtml(m.path)}" data-folder="${m.entry.type === 'folder'}" title="${app.util.escapeHtml(tooltip(m.name, m.entry))}" data-tooltip-follow style="padding-left:10px;">
                    ${m.entry.type === 'folder' ? folderIcon(false) : fileIcon(m.entry)}
                    <span class="exp-tree-name">${app.util.escapeHtml(m.name)}</span>
                </div>`).join('');
            bindSideRows(state);
        }
    }

    let searchDebounceTimer = null;
    const hdrSearch = winRoot.querySelector('.exp-hdr-search');
    if (hdrSearch) {
        hdrSearch.addEventListener('input', function () {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                state.searchQuery = hdrSearch.value;
                _refreshSearchViews();
            }, 150);
        });
    }

    const searchWrap = winRoot.querySelector('.exp-side-search-wrap');
    if (searchWrap) {
        searchWrap.addEventListener('click', function (e) {
            if (this.classList.contains('exp-search-open')) return;
            e.stopPropagation();
            this.classList.add('exp-search-open');
            hdrSearch?.focus();
        });

        document.addEventListener('click', function (e) {
            if (searchWrap.classList.contains('exp-search-open') && !searchWrap.contains(e.target)) {
                searchWrap.classList.remove('exp-search-open');
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') searchWrap.classList.remove('exp-search-open');
        });
    }

    const breadcrumbToggle = winRoot.querySelector('.exp-breadcrumb-toggle');
    if (breadcrumbToggle) {
        breadcrumbToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            winRoot.querySelector('.exp-breadcrumb')?.classList.toggle('exp-breadcrumb-open');
        });

        document.addEventListener('click', function (e) {
            const crumb = winRoot.querySelector('.exp-breadcrumb');
            if (crumb?.classList.contains('exp-breadcrumb-open') &&
                !crumb.contains(e.target) &&
                e.target !== breadcrumbToggle &&
                !breadcrumbToggle.contains(e.target)) {
                crumb.classList.remove('exp-breadcrumb-open');
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                winRoot.querySelector('.exp-breadcrumb')?.classList.remove('exp-breadcrumb-open');
            }
        });
    }

    document.addEventListener('click', e => {
        const dd = document.querySelector('.exp-crumb-dropdown');
        if (dd && !dd.contains(e.target) && !e.target.closest('.exp-crumb')) {
            closeCrumbDropdown(state);
        }
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeCrumbDropdown(state);
    });

    const filterBtn   = winRoot.querySelector('.exp-filter-btn');
    const filterPanel = winRoot.querySelector('.exp-filter-panel');
    if (filterBtn && filterPanel) {
        filterBtn.addEventListener('click', e => {
            e.stopPropagation();
            filterPanel.classList.toggle('exp-filter-open');
            filterBtn.classList.toggle('active', filterPanel.classList.contains('exp-filter-open'));
        });

        document.addEventListener('click', e => {
            if (filterPanel.classList.contains('exp-filter-open') &&
                !filterPanel.contains(e.target) && e.target !== filterBtn && !filterBtn.contains(e.target)) {
                filterPanel.classList.remove('exp-filter-open');
                filterBtn.classList.remove('active');
            }
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                filterPanel.classList.remove('exp-filter-open');
                filterBtn.classList.remove('active');
            }
        });

        filterBtn.classList.toggle('exp-filter-active', hasActiveFilters(state));

        // "File type" chips are multi-select; "Date modified" and "Size" are single-select.
        filterPanel.querySelectorAll('.exp-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                if (chip.dataset.cat) {
                    const i = state.searchFilters.types.indexOf(chip.dataset.cat);
                    if (i === -1) state.searchFilters.types.push(chip.dataset.cat);
                    else state.searchFilters.types.splice(i, 1);
                    chip.classList.toggle('active');
                } else if (chip.dataset.date) {
                    const active = state.searchFilters.date === chip.dataset.date;
                    state.searchFilters.date = active ? null : chip.dataset.date;
                    filterPanel.querySelectorAll('[data-date]').forEach(c => c.classList.remove('active'));
                    if (!active) chip.classList.add('active');
                } else if (chip.dataset.size) {
                    const active = state.searchFilters.size === chip.dataset.size;
                    state.searchFilters.size = active ? null : chip.dataset.size;
                    filterPanel.querySelectorAll('[data-size]').forEach(c => c.classList.remove('active'));
                    if (!active) chip.classList.add('active');
                }
                filterBtn.classList.toggle('exp-filter-active', hasActiveFilters(state));
                if (state.searchQuery.trim()) _refreshSearchViews();
            });
        });

        filterPanel.querySelector('.exp-filter-clear')?.addEventListener('click', () => {
            state.searchFilters = { types: [], date: null, size: null };
            filterPanel.querySelectorAll('.exp-filter-chip').forEach(c => c.classList.remove('active'));
            filterBtn.classList.remove('exp-filter-active');
            if (state.searchQuery.trim()) _refreshSearchViews();
        });
    }

    // Refresh
    winRoot.querySelector('.exp-refresh-btn')?.addEventListener('click', () => update(state));

    // Meta panel toggle
    winRoot.querySelector('.exp-meta-toggle')?.addEventListener('click', function () {
        state.metaVisible = !state.metaVisible;
        const newTitle = state.metaVisible ? _('Hide details') : _('Show details');
        this.title = newTitle;
        if (this.hasAttribute('data-tooltip')) this.setAttribute('data-tooltip', newTitle);
        this.innerHTML = state.metaVisible
            ? `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 18h6v-2H3v2zm0-5h8v-2H3v2zm0-7v2h18V6H3zm16 9.34V14h-2v2.34c-.6.28-1 .89-1 1.66 0 1.1.9 2 2 2s2-.9 2-2c0-.77-.4-1.38-1-1.66zM11 17h6v-2h-6v2z"/></svg>`
            : `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 18h6v-2H3v2zm0-5h8v-2H3v2zm0-7v2h18V6H3zm10 9h2v-2h-2v2zm0 4h2v-2h-2v2zm0-8h2V7h-2v2zm4 4h2v-2h-2v2zm0 4h2v-2h-2v2zm0-8h2V7h-2v2z"/></svg>`;
        const metaEl = winRoot.querySelector('.exp-meta');
        if (metaEl) metaEl.style.display = state.metaVisible ? '' : 'none';
    });

    // Nav lock
    winRoot.querySelector('.exp-nav-lock')?.addEventListener('click', function () {
        state.navLocked = !state.navLocked;
        const nav = winRoot.querySelector('.exp-nav');
        const newTitle = state.navLocked ? _('Unlock panel') : _('Lock panel');
        this.title = newTitle;
        if (this.hasAttribute('data-tooltip')) this.setAttribute('data-tooltip', newTitle);
        this.innerHTML = state.navLocked
            ? `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`
            : `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1C9.24 1 7 3.24 7 6v1H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2h-1V6c0-2.76-2.24-5-5-5zm0 15c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3-8H9V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2z"/></svg>`;
        if (nav) nav.classList.toggle('exp-nav-locked', state.navLocked);
    });

    if (window.matchMedia('(hover: none)').matches) {
        winRoot.querySelectorAll('.exp-nav-icons .exp-act-btn[data-panel]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.navTouchOpen = !state.navTouchOpen;
                winRoot.querySelector('.exp-nav')?.classList.toggle('exp-nav-touch-open', state.navTouchOpen);
            });
        });
    }

    // Desktop shortcut button
    winRoot.querySelector('.exp-desktop-nav-btn')?.addEventListener('click', () => {
        navigate(state, '/Desktop');
    });

    // Import local files into the virtual FS at the current path.
    // When a type-filtered picker dialog is active (state.dialogTypes,
    // e.g. the Background panel's "Select from PC" → png/jpg/
    // jpeg/webp only), files whose extension isn't in the allow-list would
    // otherwise get imported but instantly filtered out of the
    // list view by sortedItems() — silently, with no visible
    // feedback. Reject and warn about those instead.
    function _importLocalFiles(files) {
        if (!files.length) return;
        const targetNode = node(state.path || '/');
        if (!targetNode || targetNode.type !== 'folder') return;
        if (!targetNode.children) targetNode.children = {};

        let accepted = files;
        if (state.dialogTypes.length > 0) {
            const rejected = files.filter(file => {
                const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
                return !state.dialogTypes.includes(ext);
            });
            if (rejected.length > 0) {
                accepted = files.filter(file => !rejected.includes(file));
                const allowed = state.dialogTypes.map(t => '.' + t).join(', ');
                app.ui.alert({
                    title: _('Wrong File Type'),
                    body: () => `<p style="margin:0;line-height:1.5;">${
                        rejected.length === 1
                            ? `<b>${rejected[0].name}</b> ${_('is not a supported file type here.')}`
                            : `${rejected.length} ${_('files are not a supported file type here.')}`
                    } ${_('Allowed types:')} <b>${allowed}</b></p>`,
                    confirm: _('OK')
                });
            }
        }
        if (!accepted.length) return;

        accepted.forEach(file => {
            const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
            const url = URL.createObjectURL(file);
            const b = file.size;
            const size = b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB'
                       : b >= 1024    ? Math.round(b / 1024) + ' KB'
                       :                b + ' B';
            const modified = new Date().toISOString().split('T')[0];
            targetNode.children[file.name] = { type: 'file', size, modified, ext, url };
        });
        app.explorer._refreshAll(state.path);
    }

    {
        const importBtn = winRoot.querySelector('.exp-import-btn');
        if (importBtn) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.multiple = true;
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
            importBtn.addEventListener('click', () => {
                fileInput.accept = state.dialogTypes.length > 0 ? state.dialogTypes.map(t => '.' + t).join(',') : '';
                fileInput.click();
            });
            fileInput.addEventListener('change', () => {
                _importLocalFiles([...fileInput.files]);
                fileInput.value = '';
            });
        }
    }

    // "Upload files" button — same mechanism, distinct action for upload intent
    {
        const uploadBtn = winRoot.querySelector('.exp-upload-btn');
        if (uploadBtn) {
            const uploadInput = document.createElement('input');
            uploadInput.type = 'file';
            uploadInput.multiple = true;
            uploadInput.style.display = 'none';
            document.body.appendChild(uploadInput);
            uploadBtn.addEventListener('click', () => {
                uploadInput.accept = state.dialogTypes.length > 0 ? state.dialogTypes.map(t => '.' + t).join(',') : '';
                uploadInput.click();
            });
            uploadInput.addEventListener('change', () => {
                _importLocalFiles([...uploadInput.files]);
                uploadInput.value = '';
            });
        }
    }

    // Infinite scroll + box-select
    const listBody = winRoot.querySelector('.exp-list-body');
    if (listBody) {
        listBody.addEventListener('scroll', function () {
            if (this.scrollTop + this.clientHeight >= this.scrollHeight - 100) {
                loadMoreItems(state);
            }
        });

        listBody.classList.add('select');
        app.ui.boxSelect(
            listBody,
            `#${wid}-win .exp-row, #${wid}-win .exp-grid-item`,
            // onSelect — final (additive=true when Ctrl+drag)
            (selected, additive) => {
                if (!additive) {
                    state.selection.clear();
                    winRoot.querySelectorAll('.exp-row, .exp-grid-item').forEach(r => r.classList.remove('exp-selected', 'exp-selecting'));
                } else {
                    winRoot.querySelectorAll('.exp-selecting').forEach(r => r.classList.remove('exp-selecting'));
                }
                selected.forEach(r => { state.selection.add(r.dataset.path); r.classList.add('exp-selected'); });
                if (selected.length > 0) state.shiftAnchor = selected[0].dataset.path;
                if (state.selection.size === 1) {
                    const p = [...state.selection][0];
                    const parts = p.split('/');
                    const entry = node(p);
                    if (entry) updateMeta(state, parts[parts.length - 1], entry);
                } else if (state.selection.size > 1) {
                    updateMeta(state, '', null);
                }
            },
            // onMove — live preview
            live => {
                winRoot.querySelectorAll('.exp-row, .exp-grid-item').forEach(r => r.classList.remove('exp-selecting'));
                live.forEach(r => r.classList.add('exp-selecting'));
            },
            true
        );

        // Drag-and-drop between list and tree/folder targets
        bindDragDrop(state, wid, listBody);

        // Drag-and-drop from tree rows to any folder target
        const sideBodyEl = winRoot.querySelector('.exp-side-body');
        if (sideBodyEl) bindSideDragDrop(state, wid, sideBodyEl);
    }

    bindExternalDrop(state, wid);

    const expMain = winRoot.querySelector('.exp-main');
    if (expMain) {
        app.ui.contextMenu(expMain, { callback: () => app.explorer.contextMenu._build() });
    }

    // Side panel event delegation (set once — covers all tree/fav rows)
    bindSideRows(state);
}
