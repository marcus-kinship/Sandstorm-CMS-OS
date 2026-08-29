/**
 * @file explorer/window/tree.js
 * @description Side-panel tree/favorites rendering and expand/collapse
 * (without a full re-render) for the nav sidebar.
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes. Each function takes `state` as its first parameter instead
 * of closing over free variables.
 *
 * @module components/explorer/window/tree
 */
import { FAVORITES } from './state.js';
import { node, tooltip } from './fsutil.js';
import { folderIcon } from './icons.js';

/**
 * Recursively renders the folder tree rooted at `path`.
 *
 * @param {Object} state
 * @param {string} path
 * @param {number} depth
 * @returns {string}
 */
export function renderTree(state, path, depth) {
    const n = node(path);
    if (!n?.children) return '';
    const folders = Object.entries(n.children)
        .filter(([, e]) => e.type === 'folder')
        .sort(([a], [b]) => a.localeCompare(b));
    return folders.map(([name, entry]) => {
        const childPath = path === '/' ? '/' + name : path + '/' + name;
        const isOpen    = state.expanded.has(childPath);
        const isCurrent = state.path === childPath;
        const indent    = 10 + depth * 14;
        const delay     = (state.treeIdx++ * 0.04).toFixed(2);
        const arrow     = `<svg width="10" height="10" viewBox="0 0 24 24" style="transform:rotate(${isOpen ? 90 : 0}deg);transition:transform 0.15s;flex-shrink:0;"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`;
        return `
            <div class="exp-tree-row${isCurrent ? ' active' : ''}" data-path="${app.util.escapeHtml(childPath)}" data-folder="true" title="${app.util.escapeHtml(tooltip(name, entry))}" data-tooltip-follow style="padding-left:${indent}px;--exp-delay:${delay}s;">
                ${arrow}${folderIcon(isOpen)}
                <span class="exp-tree-name">${app.util.escapeHtml(name)}</span>
            </div>
            ${isOpen ? renderTree(state, childPath, depth + 1) : ''}
        `;
    }).join('');
}

/**
 * Renders the side panel's active tab content (Files tree or Favorites list).
 *
 * @param {Object} state
 * @returns {string}
 */
export function renderSideContent(state) {
    if (state.panel === 'favorites') {
        return FAVORITES.map(f => `
            <div class="exp-fav-row${state.path === f.path ? ' active' : ''}" data-path="${f.path}">
                ${folderIcon(false)}<span>${f.name}</span>
            </div>`).join('');
    }
    state.treeIdx = 0;
    return renderTree(state, '/', 0);
}

/**
 * Derives a tree row's indentation depth from its inline padding-left.
 *
 * @param {HTMLElement} row
 * @returns {number}
 */
export function treeDepth(row) {
    return Math.round((parseInt(row.style.paddingLeft, 10) - 10) / 14);
}

/**
 * Expands a tree row in place (inserts its children's HTML) without a full re-render.
 *
 * @param {Object} state
 * @param {HTMLElement} row
 * @param {string} path
 * @returns {void}
 */
export function treeExpand(state, row, path) {
    state.treeIdx = 0;
    const html = renderTree(state, path, treeDepth(row) + 1);
    if (!html.trim()) return;
    row.insertAdjacentHTML('afterend', html);
    void row.offsetHeight;
    state.winRoot.querySelectorAll('.exp-tree-row:not(.exp-visible)').forEach(el => el.classList.add('exp-visible'));
    refreshSideSortable(state);
}

/**
 * Collapses a tree row in place (removes its descendant rows) without a full re-render.
 *
 * @param {Object} state
 * @param {string} path
 * @returns {void}
 */
export function treeCollapse(state, path) {
    if (!state.winRoot) return;
    const prefix = path + '/';
    state.winRoot.querySelectorAll('.exp-tree-row').forEach(r => {
        if (r.dataset.path.startsWith(prefix)) {
            state.expanded.delete(r.dataset.path);
            r.remove();
        }
    });
    refreshSideSortable(state);
}

/**
 * Refreshes the side panel's jQuery UI Sortable instance after the tree's
 * DOM was mutated directly (expand/collapse) rather than fully re-rendered.
 *
 * @param {Object} state
 * @returns {void}
 */
export function refreshSideSortable(state) {
    if (!state.winRoot) return;
    const $sb = $(state.winRoot).find('.exp-side-body');
    if ($sb.hasClass('ui-sortable')) $sb.sortable('refresh');
}
