/**
 * @file explorer/window/core.js
 * @description The core render/navigation loop: side-panel refresh, the
 * full update (side + main), the main-area update (list/grid + breadcrumb +
 * footer + nav buttons), folder navigation (+ history), and "open file with
 * its registered handler."
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes. Each function takes `state` as its first parameter instead
 * of closing over free variables.
 *
 * Note: this module and breadcrumb.js/rows.js import from each other
 * (navigate() is used by breadcrumb click handlers; bindRows()/
 * bindColumnHeaders() are called from updateMain()). This is a safe
 * circular import — every export here is a hoisted `function` declaration
 * only invoked from event handlers that run long after the whole module
 * graph has finished loading, never from another module's top-level code.
 *
 * @module components/explorer/window/core
 */
import { node, pathName, breadcrumb, isRealStoragePath } from './fsutil.js';
import { clearSearch } from './search.js';
import { resetQuickSearch } from './quicksearch.js';
import { renderSideContent } from './tree.js';
import { renderList, renderSearchResults } from './list.js';
import { renderBreadcrumb, setupBreadcrumbInput, closeCrumbDropdown } from './breadcrumb.js';
import { bindRows, bindColumnHeaders } from './rows.js';
import { updateSearchMeta, refreshMetaFromSelection } from './meta.js';
import { ensureRealFolderLoaded } from './realfs.js';

/**
 * Refreshes just the nav sidebar (tree/favorites) + its tab buttons — used
 * when switching the Files/Favorites tab, which has no bearing on the main
 * file list and shouldn't force it to re-render.
 *
 * @param {Object} state
 * @returns {void}
 */
export function updateSide(state) {
    if (!state.winRoot) return;
    const side = state.winRoot.querySelector('.exp-side-body');
    if (side) {
        side.innerHTML = renderSideContent(state);
        void side.offsetHeight;
        side.querySelectorAll('.exp-tree-row').forEach(el => el.classList.add('exp-visible'));
    }
    state.winRoot.querySelectorAll('.exp-act-btn[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === state.panel));
}

/**
 * Full refresh: side panel + layout class + main area.
 *
 * @param {Object} state
 * @returns {void}
 */
export function update(state) {
    if (!state.winRoot) return;
    updateSide(state);
    state.winRoot.className = state.winRoot.className.replace(/\blayout-\S+/g, '').trim();
    state.winRoot.classList.add('exp-root', 'layout-' + state.layout);
    updateMain(state);
}

/**
 * Refreshes the main area: list/grid (or search results), breadcrumb,
 * back/forward button state, footer text, and active view-toggle button —
 * then re-binds row and column-header interactions.
 *
 * @param {Object} state
 * @returns {void}
 */
export function updateMain(state) {
    if (!state.winRoot) return;
    closeCrumbDropdown(state);
    const q = s => state.winRoot.querySelector(s);
    const list   = q('.exp-list-body');
    const status = q('.exp-search-status');
    const crumb  = q('.exp-breadcrumb');
    const footer = q('.exp-footer-text');
    const back   = q('.exp-back');
    const fwd    = q('.exp-fwd');

    const searching = state.searchQuery.trim().length > 0;

    if (status) {
        if (searching) {
            const scope = breadcrumb(state.path).map(c => c.name).join(' / ');
            status.innerHTML = `${_('Searching in')} <b>${app.util.escapeHtml(scope)}</b>`;
            status.style.display = 'flex';
        } else {
            status.style.display = 'none';
        }
    }

    if (searching) {
        updateSearchMeta(state);
        state._metaSearchActive = true;
    } else if (state._metaSearchActive) {
        state._metaSearchActive = false;
        refreshMetaFromSelection(state);
    }

    if (list) {
        list.innerHTML = searching ? renderSearchResults(state) : renderList(state);
        list.classList.toggle('exp-search-active', searching);
        void list.offsetHeight;
        list.querySelectorAll('.exp-row, .exp-grid-item').forEach(el => {
            el.classList.add('exp-visible');
            if (state.selection.has(el.dataset.path)) el.classList.add('exp-selected');
        });
    }
    if (crumb) {
        crumb.innerHTML = renderBreadcrumb(state);
        setupBreadcrumbInput(state);
    }
    if (back) back.disabled = state.histIdx <= 0;
    if (fwd)  fwd.disabled  = state.histIdx >= state.history.length - 1;
    if (footer) {
        if (searching) {
            footer.textContent = `${state.renderedCount} ${_('results for')} "${state.searchQuery.trim()}"`;
        } else {
            const n     = node(state.path);
            const count = n?.children ? Object.keys(n.children).length : 0;
            footer.textContent = `${count} ${_('items')}  ·  ${pathName(state.path)}`;
        }
    }
    state.winRoot.querySelectorAll('.exp-view-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
    bindRows(state);
    bindColumnHeaders(state);
}

/**
 * Navigates to `path`, updating history, and refreshes the window.
 *
 * @param {Object} state
 * @param {string} path
 * @returns {void}
 */
export function navigate(state, path) {
    app.dev.log(`Navigate → ${path}`, 'Explorer');
    clearSearch(state);
    resetQuickSearch(state);
    state.path = path;
    state.selection.clear();
    state.expanded = new Set(breadcrumb(path).map(c => c.path).filter(p => p !== '/'));
    if (state.histIdx < state.history.length - 1) state.history.splice(state.histIdx + 1);
    if (state.history[state.histIdx] !== path) { state.history.push(path); state.histIdx = state.history.length - 1; }
    update(state);

    if (isRealStoragePath(path)) {
        ensureRealFolderLoaded(state, path).then(() => {
            if (state.path === path) update(state);
        });
    }
}

/**
 * Opens a file with its registered handler — prompts "Open With" if there
 * are multiple and no saved preference, or shows "Cannot Open" if none.
 *
 * @param {Object} state
 * @param {string} path
 * @param {Object} [entry]
 * @returns {void}
 */
export function openFile(state, path, entry) {
    const e        = entry || node(path);
    const ext      = (e?.ext || path.split('.').pop() || '').toLowerCase();
    const handlers = app.program?.fileHandlers?.[ext];
    app.dev.log(`openFile: "${path}" ext="${ext}" handlers=${handlers?.length ?? 0}`, 'Explorer');

    if (!handlers || handlers.length === 0) {
        app.dev.log(`openFile: no handler for .${ext}`, 'Explorer');
        app.ui.alert({
            title:   _('Cannot Open'),
            body:    () => `<p style="margin:0;line-height:1.5;">${_('No program is registered to open')} <b>.${ext}</b> ${_('files.')}</p>`,
            confirm: _('OK')
        });
        return;
    }

    if (handlers.length === 1) {
        app.dev.log(`openFile: single handler → ${handlers[0].id}`, 'Explorer');
        handlers[0].fn(path, e);
        return;
    }

    const savedId = app.config?.get?.('userexts', ext);
    app.dev.log(`openFile: ${handlers.length} handlers, savedId="${savedId}"`, 'Explorer');
    if (savedId) {
        const saved = handlers.find(h => h.id === savedId);
        if (saved) { app.dev.log(`openFile: using saved pref → ${savedId}`, 'Explorer'); saved.fn(path, e); return; }
    }

    app.dev.log(`openFile: opening openWith dialog for .${ext}`, 'Explorer');
    app.explorer.windows.dialog.openWith({ ext, path, entry: e, handlers });
}
