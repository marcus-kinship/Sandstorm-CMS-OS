/**
 * @file explorer/window/list.js
 * @description Main list/grid rendering: sorted item computation, row/grid
 * HTML for both the normal folder listing and the whole-filesystem search
 * results, and infinite-scroll pagination ("load more").
 *
 * Split out of the original monolithic explorer.js — moved verbatim, no
 * logic changes. Each function takes `state` as its first parameter instead
 * of closing over free variables.
 *
 * @module components/explorer/window/list
 */
import { PAGE } from './state.js';
import { node, tooltip, displayName } from './fsutil.js';
import { folderIcon, fileIcon, entryCompare, animatedFolderIcon } from './icons.js';
import { searchMatches } from './search.js';
import { bindRows } from './rows.js';

/**
 * @param {Object} state
 * @param {[string, Object]} entryPair - [name, entry]
 * @param {number} i
 * @returns {string}
 */
export function rowHTML(state, [name, entry], i) {
    const p   = state.path === '/' ? '/' + name : state.path + '/' + name;
    const ico = entry.type === 'folder' ? folderIcon(false) : fileIcon(entry);
    const d   = (i * 0.04).toFixed(2);
    const disp = displayName(p, name);
    const tip = app.util.escapeHtml(tooltip(disp, entry));
    const safeName = app.util.escapeHtml(disp);
    const cells = state.columns.map(col => {
        let content = '';
        if      (col.key === 'name')     content = `<div style="display:flex;align-items:center;gap:8px;">${ico}<span>${safeName}</span></div>`;
        else if (col.key === 'type')     content = entry.type === 'folder' ? _('Folder') : (entry.ext?.toUpperCase() || '—');
        else if (col.key === 'modified') content = entry.modified || '—';
        else if (col.key === 'size')     content = entry.size || '—';
        return `<td data-col="${col.key}" style="${col.style}">${content}</td>`;
    }).join('');
    return `<tr class="exp-row" data-path="${app.util.escapeHtml(p)}" data-folder="${entry.type === 'folder'}" title="${tip}" data-tooltip-follow style="--exp-delay:${d}s;">${cells}</tr>`;
}

/**
 * @param {Object} state
 * @param {[string, Object]} entryPair - [name, entry]
 * @param {number} i
 * @returns {string}
 */
export function gridHTML(state, [name, entry], i) {
    const p    = state.path === '/' ? '/' + name : state.path + '/' + name;
    const d    = (i * 0.04).toFixed(2);
    const sz   = app.config.get('desktop', 'iconWidth') || 40;
    const disp = displayName(p, name);
    const tip  = app.util.escapeHtml(tooltip(disp, entry));
    const ico  = entry.type === 'folder'
        ? animatedFolderIcon(state, entry, sz)
        : fileIcon(entry, sz);
    return `<div class="exp-grid-item" data-path="${app.util.escapeHtml(p)}" data-folder="${entry.type === 'folder'}" title="${tip}" data-tooltip-follow style="--exp-delay:${d}s;width:${sz+30}px;">${ico}<span>${app.util.escapeHtml(disp)}</span></div>`;
}

/**
 * @param {Object} state
 * @returns {[string, Object][]|null} Sorted [name, entry] pairs for the
 *   current folder, or null if the folder doesn't exist.
 */
export function sortedItems(state) {
    const n = node(state.path);
    if (!n?.children) return null;
    let entries = Object.entries(n.children);
    if (state.dialogTypes.length > 0) {
        entries = entries.filter(([, e]) => e.type === 'folder' || state.dialogTypes.includes((e.ext || '').toLowerCase()));
    }
    return entries.sort(([nameA, a], [nameB, b]) => entryCompare(state, nameA, a, nameB, b));
}

/**
 * @param {Object} state
 * @returns {string}
 */
export function renderList(state) {
    if (node(state.path)?._loading) {
        return `<div class="exp-empty">${_('Loading…')}</div>`;
    }
    const items = sortedItems(state);
    if (!items) return `<div class="exp-empty">${_('Folder not found')}</div>`;
    if (items.length === 0) return `<div class="exp-empty">${_('Empty folder')}</div>`;

    const batch   = items.slice(0, PAGE);
    state.renderedCount = batch.length;
    const hasMore  = items.length > state.renderedCount;
    const sentinel = hasMore ? `<tr class="exp-sentinel" style="height:1px;"><td colspan="${state.columns.length}"></td></tr>` : '';

    if (state.view === 'grid') {
        const gSentinel = hasMore ? '<div class="exp-sentinel"></div>' : '';
        return `<div class="exp-grid">${batch.map((e, i) => gridHTML(state, e, i)).join('')}${gSentinel}</div>`;
    }

    const thead = state.columns.map((col, i) => {
        const isSort   = state.sortField === col.key;
        const arrowId  = isSort && state.sortDir === 'asc' ? '#ic-arrow-up' : '#ic-arrow-down';
        const arrowCls = isSort ? 'exp-col-arrow exp-col-arrow-active' : 'exp-col-arrow';
        const arrow    = `<svg class="${arrowCls}" width="14" height="14"><use href="${arrowId}"></use></svg>`;
        return `<th data-col="${col.key}" data-colidx="${i}" style="${col.style}cursor: default;user-select:none;">${col.label()}${arrow}</th>`;
    }).join('');

    return `<table class="exp-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${batch.map((e, i) => rowHTML(state, e, i)).join('')}${sentinel}</tbody>
    </table>`;
}

// ── Render: search results (whole-filesystem, shown in .exp-list-body) ────

/**
 * @param {Object} state
 * @param {{name: string, path: string, entry: Object}} item
 * @param {number} i
 * @returns {string}
 */
export function searchRowHTML(state, item, i) {
    const { name, path: p, entry } = item;
    const ico  = entry.type === 'folder' ? folderIcon(false) : fileIcon(entry);
    const d    = (i * 0.04).toFixed(2);
    const disp = displayName(p, name);
    const tip  = app.util.escapeHtml(tooltip(disp, entry));
    const dir  = p.slice(0, p.length - name.length - 1) || '/';
    const safeName = app.util.escapeHtml(disp);
    const safeDir  = app.util.escapeHtml(dir);
    const cells = state.columns.map(col => {
        let content = '';
        if (col.key === 'name') {
            content = `<div style="display:flex;align-items:center;gap:8px;min-width:0;">${ico}
                <div style="min-width:0;">
                    <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName}</div>
                    <div style="font-size:10px;opacity:0.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeDir}</div>
                </div>
            </div>`;
        }
        else if (col.key === 'type')     content = entry.type === 'folder' ? _('Folder') : (entry.ext?.toUpperCase() || '—');
        else if (col.key === 'modified') content = entry.modified || '—';
        else if (col.key === 'size')     content = entry.size || '—';
        return `<td data-col="${col.key}" style="${col.style}">${content}</td>`;
    }).join('');
    return `<tr class="exp-row exp-search-row" data-path="${app.util.escapeHtml(p)}" data-folder="${entry.type === 'folder'}" title="${tip}" data-tooltip-follow style="--exp-delay:${d}s;">${cells}</tr>`;
}

/**
 * @param {Object} state
 * @param {{name: string, path: string, entry: Object}} item
 * @param {number} i
 * @returns {string}
 */
export function searchGridHTML(state, item, i) {
    const { name, path: p, entry } = item;
    const d    = (i * 0.04).toFixed(2);
    const sz   = app.config.get('desktop', 'iconWidth') || 40;
    const disp = displayName(p, name);
    const tip  = app.util.escapeHtml(tooltip(disp, entry));
    const dir  = p.slice(0, p.length - name.length - 1) || '/';
    const ico  = entry.type === 'folder'
        ? animatedFolderIcon(state, entry, sz)
        : fileIcon(entry, sz);
    return `<div class="exp-grid-item exp-search-row" data-path="${app.util.escapeHtml(p)}" data-folder="${entry.type === 'folder'}" title="${tip}" data-tooltip-follow style="--exp-delay:${d}s;width:${sz+30}px;">
        ${ico}<span>${app.util.escapeHtml(disp)}</span><span class="exp-search-dir">${app.util.escapeHtml(dir)}</span>
    </div>`;
}

/**
 * @param {Object} state
 * @returns {string}
 */
export function renderSearchResults(state) {
    const matches = searchMatches(state, state.searchQuery);
    state.renderedCount = matches.length; // search results aren't paginated

    if (matches.length === 0) {
        return `<div class="exp-empty">${_('No results')}</div>`;
    }

    matches.sort((a, b) => {
        if (a.entry.type !== b.entry.type) return a.entry.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name, 'sv', { sensitivity: 'base' });
    });

    if (state.view === 'grid') {
        return `<div class="exp-grid">${matches.map((m, i) => searchGridHTML(state, m, i)).join('')}</div>`;
    }

    const thead = state.columns.map(col =>
        `<th data-col="${col.key}" style="${col.style}cursor:default;user-select:none;">${col.label()}</th>`
    ).join('');

    return `<table class="exp-table exp-search-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${matches.map((m, i) => searchRowHTML(state, m, i)).join('')}</tbody>
    </table>`;
}

/**
 * Appends the next page of items to an already-rendered list/grid
 * (infinite scroll) — no-op while a search is active (search results aren't paginated).
 *
 * @param {Object} state
 * @returns {void}
 */
export function loadMoreItems(state) {
    if (!state.winRoot || state.searchQuery) return;
    const items = sortedItems(state);
    if (!items || state.renderedCount >= items.length) return;

    const batch   = items.slice(state.renderedCount, state.renderedCount + PAGE);
    if (batch.length === 0) return;
    const newCount = state.renderedCount + batch.length;
    const hasMore  = newCount < items.length;

    if (state.view === 'grid') {
        const grid = state.winRoot.querySelector('.exp-grid');
        if (!grid) return;
        grid.querySelector('.exp-sentinel')?.remove();
        grid.insertAdjacentHTML('beforeend',
            batch.map((e, i) => gridHTML(state, e, i)).join('') +
            (hasMore ? '<div class="exp-sentinel"></div>' : ''));
        void grid.offsetHeight;
        grid.querySelectorAll('.exp-grid-item:not(.exp-visible)').forEach(el => el.classList.add('exp-visible'));
    } else {
        const tbody = state.winRoot.querySelector('.exp-table tbody');
        if (!tbody) return;
        tbody.querySelector('.exp-sentinel')?.remove();
        tbody.insertAdjacentHTML('beforeend',
            batch.map((e, i) => rowHTML(state, e, i)).join('') +
            (hasMore ? `<tr class="exp-sentinel" style="height:1px;"><td colspan="${state.columns.length}"></td></tr>` : ''));
        void tbody.offsetHeight;
        tbody.querySelectorAll('.exp-row:not(.exp-visible)').forEach(el => el.classList.add('exp-visible'));
    }
    state.renderedCount = newCount;
    bindRows(state);
}
